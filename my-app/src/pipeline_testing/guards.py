"""Network and AWS credential guards for pipeline tests.

Loaded once per session (`pytest -p pipeline_testing.guards`). Real AWS
credentials are removed before collection. The `moto_s3` fixture is the only
supported way to stand up S3, and its dummy keys last for that test only.

pytest-socket blocks the Python socket API, including DNS. It does not see
child processes (for example curl). Patch those calls in the test.
"""

import os

import pytest
import urllib3  # noqa: F401  # localhost IPv6 probe before sockets are disabled
from pytest_socket import disable_socket

# Cleared so botocore cannot pick up a developer shell, a profile, or IMDS.
_UNSET = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
    "AWS_WEB_IDENTITY_TOKEN_FILE",
    "AWS_ROLE_ARN",
    "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
    "AWS_CONTAINER_CREDENTIALS_FULL_URI",
    "AWS_CONTAINER_AUTHORIZATION_TOKEN",
)


def disable_aws_credentials():
    os.environ["AWS_SHARED_CREDENTIALS_FILE"] = "/dev/null"
    os.environ["AWS_CONFIG_FILE"] = "/dev/null"
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    for key in _UNSET:
        os.environ.pop(key, None)


def pytest_configure(config):
    disable_aws_credentials()
    # --disable-socket is also on the command line. Applying it here covers a
    # per-pipeline pytest.ini that loads this plugin and forgets the flag.
    # urllib3 is imported above, while sockets still work, so its AF_INET6
    # bind("::1") probe is not reported as a blocked network call.
    disable_socket()


@pytest.fixture(autouse=True)
def aws_credentials_disabled(monkeypatch):
    """Point credential files at /dev/null and drop credential env vars."""
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/dev/null")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/dev/null")
    monkeypatch.setenv("AWS_EC2_METADATA_DISABLED", "true")
    for key in _UNSET:
        monkeypatch.delenv(key, raising=False)


@pytest.fixture
def moto_s3(aws_credentials_disabled, monkeypatch):
    """S3 client served by moto. Dummy keys exist only inside this fixture.

    Credential files stay on /dev/null, so a named profile such as ``makoa``
    still cannot load. ``buildHursatImages.make_s3_client`` uses that profile;
    patch it in the test that calls it.
    """
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SECURITY_TOKEN", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    monkeypatch.setenv("AWS_SHARED_CREDENTIALS_FILE", "/dev/null")
    monkeypatch.setenv("AWS_CONFIG_FILE", "/dev/null")

    import boto3
    from moto import mock_aws

    with mock_aws():
        yield boto3.client("s3", region_name="us-east-1")
