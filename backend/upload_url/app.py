
import json, os, time, uuid
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
    owner = claims.get("email", claims["sub"])
    body = json.loads(event.get("body") or "{}")

    title = body.get("title", "").strip()
    subject = body.get("subject", "").strip()
    semester = str(body.get("semester", "")).strip()

    if not title or not subject:
        return resp(400, {"error": "title and subject are required"})

    note_id = str(uuid.uuid4())
    key = f"notes/{note_id}.pdf"

    table.put_item(Item={
        "noteId": note_id,
        "title": title,
        "subject": subject,
        "semester": semester,
        "s3Key": key,
        "owner": owner,
        "createdAt": int(time.time()),
    })

    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": "application/pdf"
        },
        ExpiresIn=300,
    )

    return resp(200, {"noteId": note_id, "uploadUrl": url})
