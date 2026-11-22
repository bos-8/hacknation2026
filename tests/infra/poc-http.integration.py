"""Check real HTTP OIDC login/logout on an already running local PoC.

Run from the repository root with python tests/infra/poc-http.integration.py.
Uses only the standard library and the public PoC admin/user accounts.
"""

import json
from html.parser import HTMLParser
from http.cookiejar import CookieJar, DefaultCookiePolicy
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener


WEB = "http://127.0.0.1:4100"
AUTH = "http://127.0.0.1:10800"


class LoopbackCookiePolicy(DefaultCookiePolicy):
    """Match browser handling of Secure cookies on a trustworthy loopback origin."""

    def return_ok_secure(self, cookie, request):
        url = urlsplit(request.full_url)
        if url.scheme == "http" and url.hostname == "127.0.0.1":
            return True
        return super().return_ok_secure(cookie, request)


class LoginForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.action = None
        self.fields = {}
        self.in_login = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form" and attrs.get("id") == "kc-form-login":
            self.action = attrs["action"]
            self.in_login = True
        if self.in_login and tag == "input" and attrs.get("name"):
            self.fields[attrs["name"]] = attrs.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form":
            self.in_login = False


def check_account(username):
    jar = CookieJar(policy=LoopbackCookiePolicy())
    opener = build_opener(HTTPCookieProcessor(jar))

    def request(url, body=None, form=False, origin=WEB):
        # Reject an accidental redirect/configuration to any non-local service.
        assert urlsplit(url).netloc in {"127.0.0.1:4100", "127.0.0.1:10800"}
        headers = {"Origin": origin}
        if body is not None:
            headers["Content-Type"] = (
                "application/x-www-form-urlencoded" if form else "application/json"
            )
            body = (urlencode(body) if form else json.dumps(body)).encode()
        return opener.open(Request(url, data=body, headers=headers), timeout=25)

    with request(WEB + "/api/v1/health/ready") as response:
        assert response.status == 200
    with request(AUTH + "/realms/FORMIQ/.well-known/openid-configuration") as response:
        discovery = json.load(response)
        assert discovery["issuer"] == AUTH + "/realms/FORMIQ"
    with request(WEB + "/api/v1/auth/sign-in/social", {
        "provider": "keycloak", "callbackURL": WEB + "/pl",
    }) as response:
        authorization_url = json.load(response)["url"]
    with request(authorization_url) as response:
        form = LoginForm()
        form.feed(response.read().decode())
    assert form.action, "Expected the Keycloak login form"
    form.fields.update(username=username, password=username)
    with request(form.action, form.fields, form=True, origin=AUTH) as response:
        assert response.geturl() == WEB + "/pl", "OIDC callback did not reach the app"
        response.read()
    with request(WEB + "/api/v1/auth/get-session") as response:
        session = json.load(response)
        assert session["user"]["uuid"] and session["user"]["name"]
        assert session["session"], "Expected an authenticated application session"
    cookie = next(cookie for cookie in jar if cookie.name.endswith(".session_token"))
    assert not cookie.secure, "HTTP PoC must not require Secure cookies"
    assert cookie.has_nonstandard_attr("HttpOnly")
    assert cookie.get_nonstandard_attr("SameSite").lower() == "lax"
    with request(WEB + "/api/v1/auth/hard-sign-out", {"locale": "pl"}) as response:
        logout = json.load(response)
        assert logout["success"]
    with request(logout["url"]) as response:
        response.read()
    with request(WEB + "/api/v1/auth/get-session") as response:
        assert json.load(response) is None, "Logout must remove the app session"
    print(f"PASS {username}: HTTP discovery, login, callback, session cookies and logout")


if __name__ == "__main__":
    for account in ("admin", "user"):
        check_account(account)
