import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/permissions";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  const session = await requireAuth();

  try {
    const body = await request.json();
    const { description, screenshots, pageUrl } = body as {
      description: string;
      screenshots: string[];
      pageUrl: string;
    };

    if (!description || !description.trim()) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    // Get email config from env
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = parseInt(process.env.SMTP_PORT || "587");
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const reportEmail = process.env.BUG_REPORT_EMAIL || "logistics@freshprints.com";
    const ccEmail = process.env.BUG_REPORT_CC || "asif@freshprints.com";

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("SMTP configuration missing");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Prepare email attachments
    const attachments: Array<{ filename: string; content: string; encoding: string }> = [];

    if (screenshots && screenshots.length > 0) {
      screenshots.forEach((screenshot, index) => {
        const base64Data = screenshot.split(",")[1] || screenshot;
        attachments.push({
          filename: `screenshot-${index + 1}-${Date.now()}.png`,
          content: base64Data,
          encoding: "base64",
        });
      });
    }

    // Send email
    const mailOptions = {
      from: smtpUser,
      to: reportEmail,
      cc: ccEmail,
      subject: `Bug Report - ${new URL(pageUrl).pathname}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #dc2626;">🐛 Bug Report</h2>

          <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0 0 8px 0;"><strong>Reported by:</strong> ${session.user.email}</p>
            <p style="margin: 0 0 8px 0;"><strong>Page:</strong> ${pageUrl}</p>
            <p style="margin: 0;"><strong>Time:</strong> ${new Date().toISOString()}</p>
          </div>

          <div style="margin: 16px 0;">
            <h3 style="color: #374151; margin: 0 0 8px 0;">Description</h3>
            <p style="white-space: pre-wrap; background-color: #f9fafb; padding: 12px; border-radius: 6px; margin: 0;">
              ${description.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
            </p>
          </div>

          ${screenshots && screenshots.length > 0 ? `
            <div style="margin: 16px 0;">
              <h3 style="color: #374151; margin: 0 0 8px 0;">Screenshot${screenshots.length > 1 ? "s" : ""}</h3>
              <p style="color: #6b7280; font-size: 12px;">${screenshots.length} image${screenshots.length > 1 ? "s" : ""} attached</p>
            </div>
          ` : ""}

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            This bug report was submitted through the app's built-in bug report feature.
          </p>
        </div>
      `,
      attachments,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bug report error:", error);
    return NextResponse.json(
      { error: "Failed to submit bug report" },
      { status: 500 }
    );
  }
}
