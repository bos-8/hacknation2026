"""Install a fixed-deadline admission hook on an existing Harness."""

import argparse
import io
import json
import time
import zipfile
from datetime import datetime
from pathlib import Path

import boto3

parser = argparse.ArgumentParser()
parser.add_argument("--profile")
parser.add_argument("--region", required=True)
parser.add_argument("--harness-id", required=True)
parser.add_argument("--expires-at", required=True)
args = parser.parse_args()
expiry = datetime.fromisoformat(args.expires_at)
if expiry.tzinfo is None:
    parser.error("expires-at must contain a timezone")
session = boto3.Session(profile_name=args.profile, region_name=args.region)
control = session.client("bedrock-agentcore-control")
iam = session.client("iam")
functions = session.client("lambda")
harness = control.get_harness(harnessId=args.harness_id)["harness"]
account = session.client("sts").get_caller_identity()["Account"]
name = args.harness_id + "-expiry"
role_name = name + "-lambda"
try:
    role = iam.get_role(RoleName=role_name)["Role"]
except iam.exceptions.NoSuchEntityException:
    role = iam.create_role(
        RoleName=role_name,
        AssumeRolePolicyDocument=json.dumps(
            {
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Principal": {"Service": "lambda.amazonaws.com"},
                        "Action": "sts:AssumeRole",
                    }
                ],
            }
        ),
        Description="Runs the fixed-deadline harness admission hook without resource permissions.",
    )["Role"]
    time.sleep(10)

archive = io.BytesIO()
with zipfile.ZipFile(archive, "w") as bundle:
    bundle.write(Path(__file__).with_name("expiry_hook.py"), "expiry_hook.py")
environment = {
    "Variables": {"EXPIRES_AT": args.expires_at, "HARNESS_ARN": harness["arn"]}
}
try:
    function = functions.get_function(FunctionName=name)["Configuration"]
except functions.exceptions.ResourceNotFoundException:
    function = functions.create_function(
        FunctionName=name,
        Role=role["Arn"],
        Runtime="python3.14",
        Handler="expiry_hook.lambda_handler",
        Code={"ZipFile": archive.getvalue()},
        Timeout=3,
        MemorySize=128,
        Environment=environment,
        Description="Deny harness invocations after a fixed deadline.",
    )
else:
    functions.update_function_code(FunctionName=name, ZipFile=archive.getvalue())
    functions.get_waiter("function_updated_v2").wait(FunctionName=name)
    functions.update_function_configuration(FunctionName=name, Environment=environment)
functions.get_waiter("function_active_v2").wait(FunctionName=name)
execution_role = harness["executionRoleArn"].split("/")[-1]
iam.put_role_policy(
    RoleName=execution_role,
    PolicyName="InvokeHarnessExpiryHook",
    PolicyDocument=json.dumps(
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": "lambda:InvokeFunction",
                    "Resource": function["FunctionArn"],
                }
            ],
        }
    ),
)
hook = {
    "beforeInvocation": {
        "name": "fixed_expiry",
        "target": {
            "lambda": {
                "arn": function["FunctionArn"],
                "timeoutSeconds": 5,
                "failureMode": "deny",
            }
        },
    }
}
hooks = [
    h
    for h in harness.get("hooks", [])
    if h.get("beforeInvocation", {}).get("name") != "fixed_expiry"
]
updated = control.update_harness(harnessId=args.harness_id, hooks=[*hooks, hook])[
    "harness"
]
print(
    json.dumps(
        {
            "status": updated["status"],
            "expires_at": args.expires_at,
            "version": updated["harnessVersion"],
        }
    )
)
