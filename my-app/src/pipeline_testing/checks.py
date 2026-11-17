"""Assertions shared by the Hurricane and Snow guard tests."""

import os
import socket
import tomllib
from pathlib import Path

import pytest
from pytest_socket import SocketBlockedError

_UNSET = (
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_SECURITY_TOKEN",
    "AWS_PROFILE",
    "AWS_DEFAULT_PROFILE",
)


def assert_network_blocked():
    # pytest-socket rejects socket construction itself, before connect(),
    # and warns from the exception constructor.
    with pytest.warns(UserWarning, match="socket.socket"):
        with pytest.raises(SocketBlockedError):
            socket.socket(socket.AF_INET, socket.SOCK_STREAM)


def assert_aws_credentials_disabled():
    assert os.environ["AWS_SHARED_CREDENTIALS_FILE"] == "/dev/null"
    assert os.environ["AWS_CONFIG_FILE"] == "/dev/null"
    assert os.environ["AWS_EC2_METADATA_DISABLED"] == "true"
    for key in _UNSET:
        assert key not in os.environ


def assert_no_real_aws_call():
    import boto3
    from botocore.exceptions import NoCredentialsError

    client = boto3.client("s3", region_name="us-east-1")
    with pytest.raises(NoCredentialsError):
        client.list_buckets()


def assert_named_profile_cannot_load():
    import boto3
    from botocore.exceptions import ProfileNotFound

    with pytest.raises(ProfileNotFound):
        boto3.session.Session(profile_name="makoa")


def assert_moto_s3(s3):
    s3.create_bucket(Bucket="pipeline-infra-test")
    s3.put_object(
        Bucket="pipeline-infra-test",
        Key="snow/pass_snowfall_data.json",
        Body=b"{}",
    )
    body = s3.get_object(
        Bucket="pipeline-infra-test",
        Key="snow/pass_snowfall_data.json",
    )["Body"].read()
    assert body == b"{}"
    # The fixture's dummy keys must not be a profile loaded from disk.
    assert os.environ["AWS_SHARED_CREDENTIALS_FILE"] == "/dev/null"
    assert os.environ["AWS_CONFIG_FILE"] == "/dev/null"


def assert_requirements_pinned(pipeline_dir):
    pipeline_dir = Path(pipeline_dir)
    specs = [
        line.strip()
        for line in (pipeline_dir / "requirements-dev.txt").read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]
    pyproject = pipeline_dir.parent / "pipeline_testing" / "pyproject.toml"
    with pyproject.open("rb") as handle:
        locked = tomllib.load(handle)["dependency-groups"]["dev"]
    assert specs == locked
