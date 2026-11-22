"""HTTPS adapter for the private form-design Harness."""

import base64
import hmac
import json
import os
import urllib.request
from contextlib import closing
from datetime import UTC, datetime
from uuid import uuid4

import boto3
from botocore.config import Config


def reply(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    headers = {k.lower(): v for k, v in event.get("headers", {}).items()}
    expected = os.environ.get("API_KEY", "")
    if not expected or not hmac.compare_digest(
        headers.get("authorization", ""), "Bearer " + expected
    ):
        return reply(401, {"error": "unauthorized"})
    deadline = datetime.fromisoformat(os.environ["EXPIRES_AT"])
    remaining = int((deadline - datetime.now(UTC)).total_seconds())
    if remaining <= 0:
        return reply(403, {"error": "agentcore_expired"})
    if event.get("requestContext", {}).get("http", {}).get("method") != "POST":
        return reply(405, {"error": "method_not_allowed"})
    try:
        raw = event.get("body", "")
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw, validate=True).decode()
        if len(raw) > 5_000_000:
            return reply(413, {"error": "payload_too_large"})
        source = json.loads(raw)
        if "messages" in source:
            if not isinstance(source["messages"], list) or len(source["messages"]) > 10:
                raise ValueError
        else:
            if set(source) != {"text", "observations"} or not isinstance(source["text"], str):
                raise ValueError
            observation = source["observations"]
            if not isinstance(observation, dict) or not isinstance(observation.get("fields"), list):
                raise ValueError
            if len(observation["fields"]) > 400:
                raise ValueError
    except (ValueError, TypeError, KeyError):
        return reply(400, {"error": "invalid_request"})

    leases = boto3.client("dynamodb")
    owner = str(uuid4())
    acquired = None
    now = int(datetime.now(UTC).timestamp())
    try:
        for slot in range(4):
            try:
                leases.put_item(
                    TableName=os.environ["LEASE_TABLE"],
                    Item={
                        "slot": {"S": str(slot)},
                        "owner": {"S": owner},
                        "expires": {"N": str(now + 300)},
                    },
                    ConditionExpression="attribute_not_exists(#slot) OR expires < :now",
                    ExpressionAttributeNames={"#slot": "slot"},
                    ExpressionAttributeValues={":now": {"N": str(now)}},
                )
                acquired = str(slot)
                break
            except leases.exceptions.ConditionalCheckFailedException:
                continue
        if acquired is None:
            return reply(429, {"error": "busy"})
        return generate(raw, remaining)
    except Exception:
        return reply(503, {"error": "unavailable"})
    finally:
        if acquired is not None:
            try:
                leases.delete_item(
                    TableName=os.environ["LEASE_TABLE"],
                    Key={"slot": {"S": acquired}},
                    ConditionExpression="#owner = :owner",
                    ExpressionAttributeNames={"#owner": "owner"},
                    ExpressionAttributeValues={":owner": {"S": owner}},
                )
            except Exception:
                pass
        leases.close()


def generate(raw, remaining):
    source = json.loads(raw)
    if "messages" in source:
        payload = {
            "model": os.environ["OCR_MODEL"], "messages": source["messages"],
            "max_tokens": min(int(source.get("max_tokens", 8192)), 24576),
            "temperature": 0, "reasoning_effort": "none", "routing": {"sort": "latency"},
        }
        if "response_format" in source:
            payload["response_format"] = {"type": "json_object"}
        request = urllib.request.Request(
            "https://api.edenai.run/v3/chat/completions", data=json.dumps(payload).encode(),
            headers={"Authorization": "Bearer " + os.environ["OCR_API_KEY"],
                     "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=min(240, remaining)) as response:
                result = response.read(2_000_001)
                if len(result) > 2_000_000:
                    return reply(502, {"error": "response_too_large"})
                return reply(200, json.loads(result))
        except Exception:
            return reply(502, {"error": "ocr_failed"})

    with open("prompt.txt", encoding="utf-8") as file:
        prompt = file.read()
    client = boto3.client(
        "bedrock-agentcore",
        config=Config(
            connect_timeout=5,
            read_timeout=min(240, remaining),
            retries={"total_max_attempts": 1},
        ),
    )
    try:
        result = client.invoke_harness(
            harnessArn=os.environ["HARNESS_ARN"],
            runtimeSessionId=str(uuid4()),
            systemPrompt=[{"text": prompt}],
            messages=[{"role": "user", "content": [{"text": raw}]}],
            allowedTools=[],
            tools=[],
            maxIterations=3,
            timeoutSeconds=min(240, remaining),
        )
        output = []
        size = 0
        with closing(result["stream"]) as stream:
            for item in stream:
                if (
                    "contentBlockDelta" in item
                    or "messageStop" in item
                    or any(k.endswith(("Error", "Exception")) for k in item)
                ):
                    size += len(json.dumps(item))
                    if size > 600_000:
                        return reply(502, {"error": "response_too_large"})
                    output.append(item)
        return reply(200, {"events": output})
    except Exception:
        return reply(502, {"error": "agentcore_failed"})
    finally:
        client.close()
