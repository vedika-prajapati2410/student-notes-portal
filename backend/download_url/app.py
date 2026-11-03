
import json
import os
import boto3
from botocore.config import Config

s3 = boto3.client(
    "s3",
    region_name=os.environ["AWS_REGION"],
    endpoint_url=f"https://s3.{os.environ['AWS_REGION']}.amazonaws.com",
    config=Config(signature_version="s3v4")
)

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
BUCKET = os.environ["BUCKET_NAME"]


def resp(code, body):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str)
    }


def lambda_handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    owner = claims.get("email") or claims["sub"]

    note_id = event["pathParameters"]["id"]

    item = table.get_item(
        Key={"noteId": note_id}
    ).get("Item")

    if not item or item.get("owner") != owner:
        return resp(404, {"error": "note not found"})

    url = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET,
            "Key": item["s3Key"]
        },
        ExpiresIn=300,
    )

    return resp(200, {
        "downloadUrl": url,
        "title": item["title"]
    })
