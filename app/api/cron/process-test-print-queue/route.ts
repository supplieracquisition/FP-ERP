import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { testPrintQueue, orderItems, orderImages, suppliers, users } from "@/lib/db/schema";
import { eq, isNull, and, sql } from "drizzle-orm";
import { createNotification } from "@/lib/createNotification";
import { sendTestPrintToChat } from "@/lib/googleChat";
import { imageUrl } from "@/lib/uploads";

// Process test prints that are queued for notification
// This should be called every ~1 minute by an external cron service
export async function POST(request: NextRequest) {
  // Basic auth check - verify the request has the cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find queued test prints that are older than 10 minutes and haven't been notified yet
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const queuedItems = await db
      .select()
      .from(testPrintQueue)
      .where(
        and(
          sql`${testPrintQueue.firstUploadTime} <= ${tenMinutesAgo}`,
          isNull(testPrintQueue.notificationSentAt)
        )
      );

    if (queuedItems.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending notifications" });
    }

    let successCount = 0;
    const errors: string[] = [];

    for (const queuedItem of queuedItems) {
      try {
        const [orderItem] = await db
          .select()
          .from(orderItems)
          .where(eq(orderItems.orderItemId, queuedItem.orderItemId))
          .limit(1);

        if (!orderItem) {
          errors.push(`Order ${queuedItem.orderItemId} not found`);
          continue;
        }

        // Get supplier info
        const [supplierInfo] = await db
          .select({ name: suppliers.name })
          .from(suppliers)
          .where(eq(suppliers.id, orderItem.supplierId || -1))
          .limit(1);

        // Get all test print images for this order
        const testPrints = await db
          .select({ id: orderImages.id })
          .from(orderImages)
          .where(
            and(
              eq(orderImages.orderItemId, queuedItem.orderItemId),
              eq(orderImages.type, "test_print")
            )
          );

        // Create notification
        await createNotification({
          type: "test_print",
          orderItemId: queuedItem.orderItemId,
          triggeredBy: 0, // System-triggered, no specific user
          message: `${queuedItem.uploadCount} new test print${queuedItem.uploadCount > 1 ? "s" : ""} submitted for order ${queuedItem.orderItemId}`,
          audience: "team",
          sendEmail: true,
        });

        // Send to Google Chat
        await sendTestPrintToChat({
          orderItemId: queuedItem.orderItemId,
          supplierName: supplierInfo?.name ?? "Unknown supplier",
          submittedBy: "Supplier",
          // Now authenticated URLs: a recipient who is signed in sees the
          // image, one who is not gets sent to the login page.
          imageUrls: testPrints.map((t: any) =>
            imageUrl(queuedItem.orderItemId, t.id)
          ),
        });

        // Mark as notified
        await db
          .update(testPrintQueue)
          .set({ notificationSentAt: new Date().toISOString() })
          .where(eq(testPrintQueue.id, queuedItem.id));

        successCount++;
      } catch (error) {
        errors.push(
          `Failed to process ${queuedItem.orderItemId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return NextResponse.json({
      processed: successCount,
      total: queuedItems.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Test print queue processor error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process test print queue",
      },
      { status: 500 }
    );
  }
}
