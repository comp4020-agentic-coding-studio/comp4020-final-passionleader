import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

// Sign-up and password-reset codes, sent by AWS SES from SES_FROM
// (no-reply@passionleader.click). The keys are the same Fly secrets as S3's;
// without SES_FROM nothing is sent and sign-up says so (error code MAIL-…).
// MAIL_TEST_OUTBOX=1 (the CI container only, never on Fly) keeps the last
// message to each address in memory for the spec to read, instead of sending.

const FROM = process.env.SES_FROM;
const TEST_OUTBOX = process.env.MAIL_TEST_OUTBOX === "1";
const ses = FROM && process.env.AWS_REGION && !TEST_OUTBOX ? new SESv2Client({ region: process.env.AWS_REGION }) : null;

const outbox = new Map<string, { subject: string; text: string }>();

export const mailReady = (): boolean => TEST_OUTBOX || ses !== null;
export const testOutbox = (): boolean => TEST_OUTBOX;
/** The last message sent to `to` (MAIL_TEST_OUTBOX only). */
export const lastMail = (to: string): { subject: string; text: string } | undefined => (TEST_OUTBOX ? outbox.get(to.toLowerCase()) : undefined);

export class MailFailure extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** Sends a short plain-text message, or throws MailFailure("MAIL-CONFIG" | "MAIL-SEND"). */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (TEST_OUTBOX) {
    outbox.set(to.toLowerCase(), { subject, text });
    return;
  }
  if (!ses || !FROM) throw new MailFailure("MAIL-CONFIG");
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: `ANU Crossing (unofficial) <${FROM}>`,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
      }),
    );
  } catch (err) {
    console.error(JSON.stringify({ at: new Date().toISOString(), event: "mail-error", error: String((err as Error)?.name ?? err) }));
    throw new MailFailure("MAIL-SEND");
  }
}
