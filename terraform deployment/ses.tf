# ═══════════════════════════════════════════════════════════════
#  Amazon SES — Email Identity
#  The rexony_sns Lambda sends order-confirmation emails from
#  the verified SES sender address.
#
#  NOTE: After terraform apply, you must click the verification
#  link in the email AWS sends to ses_from_email.
# ═══════════════════════════════════════════════════════════════

resource "aws_ses_email_identity" "sender" {
  email = var.ses_from_email
}
