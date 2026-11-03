
import json
import os
import boto3
from boto3.dynamodb.conditions import Attr

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])


def resp(code, body):
    return {
        "statusCode": code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, default=str)
    }


def lambda_handler(event, context):
    claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    owner = claims.get("email") or claims["sub"]

    params = event.get("queryStringParameters") or {}
    q = (params.get("q") or "").lower()
    subject = (params.get("subject") or "").lower()

    items = []
    kwargs = {
        "FilterExpression": Attr("owner").eq(owner)
    }

    while True:
        result = table.scan(**kwargs)
        items.extend(result["Items"])

        if "LastEvaluatedKey" not in result:
            break

        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]

    if subject:
        items = [
            i for i in items
            if i.get("subject", "").lower() == subject
        ]

    if q:
        items = [
            i for i in items
            if q in i.get("title", "").lower()
            or q in i.get("subject", "").lower()
        ]

    for item in items:
        item.pop("s3Key", None)
        item.pop("owner", None)

    items.sort(
        key=lambda i: i.get("createdAt", 0),
        reverse=True
    )

    return resp(200, {"notes": items})
