import * as React from "react";
import { FileText, Upload, Download, Trash2, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useStore } from "@/store/store-context";
import { useAuth } from "@/store/auth-context";
import type { Document } from "@/store/types";
import { formatDate } from "@/lib/format";

function humanSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function extType(name: string) {
  const ext = name.split(".").pop()?.toUpperCase();
  return ext && ext.length <= 4 ? ext : "FILE";
}

export function DocumentsPage() {
  const { documents, addDocument, removeDocument } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [query, setQuery] = React.useState("");
  const [deleting, setDeleting] = React.useState<Document | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f) => {
      addDocument({
        name: f.name,
        type: extType(f.name),
        size: humanSize(f.size),
        owner: user?.name ?? "You",
      });
    });
    toast({ variant: "success", title: "Upload complete", description: `${files.length} file(s) added.` });
    if (fileInput.current) fileInput.current.value = "";
  };

  const filtered = documents.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Documents"
        description="Store contracts, policies, and files."
        actions={
          <Button size="lg" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" /> Upload
          </Button>
        }
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents…"
              className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:shadow-focus"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-muted/60">
              <tr>
                {["Name", "Type", "Size", "Owner", "Updated", ""].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-border transition-colors even:bg-muted/25 hover:bg-secondary/70">
                  <td className="px-4 py-3 pl-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <FileText className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-medium text-foreground">{d.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {d.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{d.size}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{d.owner}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(d.updatedAt)}</td>
                  <td className="px-4 py-3 pr-5">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Download"
                        onClick={() => toast({ variant: "info", title: "Download started", description: d.name })}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        aria-label="Delete"
                        onClick={() => setDeleting(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted-foreground">
                    No documents found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete document?"
        description={deleting ? `"${deleting.name}" will be permanently removed.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) {
            removeDocument(deleting.id);
            toast({ variant: "success", title: "Document deleted" });
          }
        }}
      />
    </>
  );
}
