"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import html2canvas from "html2canvas";

export function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function captureScreenshot() {
    try {
      setLoading(true);

      // Try multiple capture strategies
      let canvas;
      const element = document.body;

      try {
        // Strategy 1: Capture body element (simpler, often more reliable)
        canvas = await html2canvas(element, {
          allowTaint: true,
          useCORS: true,
          backgroundColor: "#ffffff",
          scale: 0.8, // Reduce scale for better compatibility
          logging: false,
          imageTimeout: 5000,
          ignoreElements: (el) => {
            // Ignore certain elements that cause issues
            return el.id === "bug-report-modal";
          },
        });
      } catch (strategyError) {
        console.warn("Strategy 1 failed, trying strategy 2...", strategyError);
        // Strategy 2: Capture just the visible viewport
        canvas = await html2canvas(window.document.documentElement, {
          allowTaint: true,
          useCORS: true,
          backgroundColor: "#ffffff",
          scale: 0.5,
          logging: false,
          windowHeight: window.innerHeight,
          windowWidth: window.innerWidth,
        });
      }

      const base64 = canvas.toDataURL("image/png", 0.75);
      setScreenshots([...screenshots, base64]);
      toast.success("Screenshot captured successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Screenshot capture failed:", {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        pageUrl: window.location.href,
        timestamp: new Date().toISOString(),
      });
      toast.error("Screenshot capture failed — please choose image file manually");
      setScreenshots([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file count (max 5 images)
    if (screenshots.length + files.length > 5) {
      toast.error("Maximum 5 images allowed");
      return;
    }

    let loadedCount = 0;
    files.forEach((file) => {
      // Validate file size (max 5MB per file)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 5MB)`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setScreenshots((prev) => [...prev, base64]);
        loadedCount++;
        if (loadedCount === files.length) {
          toast.success(`${files.length} image${files.length > 1 ? "s" : ""} uploaded`);
        }
      };
      reader.onerror = () => {
        toast.error(`Failed to read ${file.name}`);
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    e.target.value = "";
  }

  async function submitReport() {
    if (!description.trim()) {
      toast.error("Please describe the bug");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          screenshots,
          pageUrl: window.location.href,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit report");
      }

      toast.success("Bug report submitted! Thank you.");
      setOpen(false);
      setDescription("");
      setScreenshots([]);
    } catch (error) {
      console.error("Error submitting bug report:", error);
      toast.error("Failed to submit bug report");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
        title="Report a bug"
      >
        <span className="text-xl">🐛</span>
        <span className="absolute right-16 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
          Report bug
        </span>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-gray-900">Report a Bug</h2>
            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Describe the issue
            </label>
            <textarea
              ref={textareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What went wrong? What did you expect?"
              rows={4}
              className="w-full text-sm border border-gray-300 rounded px-3 py-2 focus:outline-none focus:border-gray-700 resize-none"
              disabled={loading}
            />
            <p className="text-xs text-gray-400 mt-1">
              {description.length}/500 characters
            </p>
          </div>

          {screenshots.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-medium text-gray-600">
                  Screenshots ({screenshots.length}/5)
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {screenshots.map((screenshot, idx) => (
                  <div key={idx} className="relative group">
                    <div className="border border-gray-200 rounded overflow-hidden bg-gray-50">
                      <img
                        src={screenshot}
                        alt={`Screenshot ${idx + 1}`}
                        className="w-full h-24 object-cover"
                      />
                    </div>
                    <button
                      onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {screenshots.length < 5 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 rounded px-3 py-2 transition-colors"
                >
                  + Add more
                </button>
              )}
            </div>
          )}

          {screenshots.length === 0 && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-xs border border-gray-300 text-gray-600 hover:bg-gray-50 rounded px-3 py-2 transition-colors"
              >
                📁 Upload screenshot(s)
              </button>
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />

          <p className="text-xs text-gray-500">
            Page: <span className="font-mono text-gray-600">{window.location.pathname}</span>
          </p>

          <div className="flex gap-2 pt-2">
            <button
              onClick={submitReport}
              disabled={loading || !description.trim()}
              className="flex-1 bg-red-500 text-white px-4 py-2 rounded font-medium text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Submitting..." : "Submit Report"}
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded font-medium text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
