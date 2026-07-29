interface ChatCard {
  orderItemId: string;
  supplierName: string;
  submittedBy: string;
  imageUrls: string[];
}

export async function sendTestPrintToChat(opts: ChatCard) {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("[GOOGLE CHAT] No webhook URL configured — skipping");
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const orderUrl = `${appUrl}/orders/${opts.orderItemId}`;

  const imagesText =
    opts.imageUrls.length > 0
      ? opts.imageUrls.map((u, i) => `<${appUrl}${u}|Image ${i + 1}>`).join("  ·  ")
      : "_No images attached_";

  const payload = {
    cards: [
      {
        header: {
          title: "🖨️ Test Print Submitted",
          subtitle: `Order ${opts.orderItemId}`,
        },
        sections: [
          {
            widgets: [
              {
                keyValue: {
                  topLabel: "Supplier",
                  content: opts.supplierName,
                },
              },
              {
                keyValue: {
                  topLabel: "Submitted by",
                  content: opts.submittedBy,
                },
              },
              {
                keyValue: {
                  topLabel: "Images",
                  content: imagesText,
                  contentMultiline: true,
                },
              },
              {
                buttons: [
                  {
                    textButton: {
                      text: "View Order",
                      onClick: { openLink: { url: orderUrl } },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("[GOOGLE CHAT] Webhook failed:", await res.text());
  }
}
