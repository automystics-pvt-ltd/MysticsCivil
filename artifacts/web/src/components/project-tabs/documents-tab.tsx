import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectDocuments,
  useCreateDocument,
  useDeleteDocument,
  getListProjectDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus, FileText, ExternalLink, Upload, Loader2, Trash2, AlertCircle, FileUp, Link2,
} from "lucide-react";
import { formatDate } from "@/lib/ocms-format";

const CATEGORIES = ["Drawing", "BoQ", "EHS", "QA/QC", "Contract", "Method Statement", "Other"] as const;

function fileIconLabel(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (["pdf"].includes(ext)) return "PDF";
  if (["doc", "docx"].includes(ext)) return "DOC";
  if (["xls", "xlsx", "csv"].includes(ext)) return "XLS";
  if (["dwg", "dxf"].includes(ext)) return "DWG";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "IMG";
  if (["zip", "rar", "7z"].includes(ext)) return "ZIP";
  return ext.toUpperCase() || "FILE";
}

export function DocumentsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"file" | "url">("file");
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ name: "", url: "", category: "Drawing", version: 1 });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, refetch } = useListProjectDocuments(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectDocumentsQueryKey(projectId) },
  });
  const create = useCreateDocument();
  const del = useDeleteDocument();
  const upload = useUpload();

  const reset = () => {
    setFile(null);
    setForm({ name: "", url: "", category: "Drawing", version: 1 });
    setSubmitError(null);
    setSource("file");
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      // Auto-fill name from the filename (without extension) if blank
      if (!form.name) {
        const stem = f.name.replace(/\.[^.]+$/, "");
        setForm((s) => ({ ...s, name: stem }));
      }
    }
    e.target.value = "";
  };

  const submit = async () => {
    setSubmitError(null);
    if (!form.name.trim()) { setSubmitError("Document name is required."); return; }

    let docUrl = form.url;
    if (source === "file") {
      if (!file) { setSubmitError("Please choose a file to upload."); return; }
      const uploaded = await upload.uploadFile(file);
      if (!uploaded) { setSubmitError(upload.error?.message ?? "Upload failed."); return; }
      docUrl = `/api/storage${uploaded.objectPath}`;
    } else {
      if (!form.url.trim()) { setSubmitError("URL is required when linking an external file."); return; }
    }

    create.mutate(
      { projectId, data: { ...form, url: docUrl } },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
          qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
          refetch();
        },
        onError: (err: unknown) => {
          setSubmitError(err instanceof Error ? err.message : "Failed to save document.");
        },
      },
    );
  };

  const onDelete = (docId: string) => {
    del.mutate(
      { projectId, documentId: docId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListProjectDocumentsQueryKey(projectId) });
          refetch();
        },
      },
    );
  };

  const busy = upload.isUploading || create.isPending;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Document Register</CardTitle>
        <Dialog open={open} onOpenChange={(o) => { if (!busy) { setOpen(o); if (!o) reset(); } }}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="document-add-btn"><Plus className="h-4 w-4 mr-1" /> Add Document</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
              <DialogDescription>
                Upload a file from this device, or link to an existing document URL.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Source toggle */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSource("file")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                    source === "file"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                  data-testid="document-source-file"
                >
                  <FileUp className="h-5 w-5" />
                  Upload file
                </button>
                <button
                  type="button"
                  onClick={() => setSource("url")}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-xs transition ${
                    source === "url"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/40"
                  }`}
                  data-testid="document-source-url"
                >
                  <Link2 className="h-5 w-5" />
                  Link URL
                </button>
              </div>

              {source === "file" ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={onPick}
                    data-testid="document-file-input"
                  />
                  {file ? (
                    <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3 min-w-0 overflow-hidden">
                      <div className="h-10 w-10 rounded bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {fileIconLabel(file.name)}
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div
                          className="text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                          title={file.name}
                        >
                          {file.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setFile(null)}
                        type="button"
                        className="flex-shrink-0"
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-6 flex flex-col items-center gap-2 text-sm text-muted-foreground hover:bg-muted/40 transition"
                      data-testid="document-pick-btn"
                    >
                      <Upload className="h-6 w-6" />
                      <span>Click to choose a file</span>
                      <span className="text-xs">PDF, DOC, XLS, DWG, images, ZIP — any file type</span>
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <Label htmlFor="doc-url">External URL</Label>
                  <Input
                    id="doc-url"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="https://drive.google.com/…"
                    data-testid="document-url-input"
                  />
                </div>
              )}

              <div>
                <Label htmlFor="doc-name">Document Name</Label>
                <Input
                  id="doc-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Structural drawings — Rev C"
                  data-testid="document-name-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="doc-category">Category</Label>
                  <select
                    id="doc-category"
                    className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    data-testid="document-category-select"
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="doc-version">Version</Label>
                  <Input
                    id="doc-version"
                    type="number"
                    min={1}
                    value={form.version}
                    onChange={(e) => setForm({ ...form, version: parseInt(e.target.value) || 1 })}
                    data-testid="document-version-input"
                  />
                </div>
              </div>

              {submitError && (
                <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{submitError}</span>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} type="button">
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy} data-testid="document-save-btn">
                {busy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {upload.isUploading ? "Uploading…" : "Saving…"}
                  </span>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No documents uploaded yet. Click <strong>Add Document</strong> to upload or link one.
          </div>
        ) : (
          <div className="divide-y">
            {data.map((d) => (
              <div key={d.id} className="flex items-center gap-3 py-3 min-w-0" data-testid={`document-row-${d.id}`}>
                <div className="h-9 w-9 rounded bg-muted text-muted-foreground flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                  {fileIconLabel(d.name)}
                </div>
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div
                    className="font-medium overflow-hidden text-ellipsis whitespace-nowrap"
                    title={d.name}
                  >
                    {d.name}
                  </div>
                  <div className="text-xs text-muted-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {d.category} · v{d.version} · {formatDate(d.createdAt)}
                  </div>
                </div>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-sm flex items-center gap-1 flex-shrink-0"
                  data-testid={`document-open-${d.id}`}
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-rose-600 flex-shrink-0"
                      data-testid={`document-delete-${d.id}`}
                      aria-label="Delete document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this document?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes <strong>{d.name}</strong> from the register. The underlying file is not removed from storage.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onDelete(d.id)}
                        className="bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
