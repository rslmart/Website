"""Hurricane pipeline guard tests. Behaviour tests land in a later goal."""

from pipeline_testing.checks import (
    assert_aws_credentials_disabled,
    assert_moto_s3,
    assert_named_profile_cannot_load,
    assert_network_blocked,
    assert_no_real_aws_call,
    assert_requirements_pinned,
)


def test_network_blocked():
    assert_network_blocked()


def test_aws_credentials_disabled():
    assert_aws_credentials_disabled()


def test_boto3_does_not_call_aws():
    assert_no_real_aws_call()


def test_makoa_profile_cannot_load():
    assert_named_profile_cannot_load()


def test_moto_s3(moto_s3):
    assert_moto_s3(moto_s3)


def test_requirements_dev_pinned():
    from pathlib import Path

    assert_requirements_pinned(Path(__file__).resolve().parents[1])
