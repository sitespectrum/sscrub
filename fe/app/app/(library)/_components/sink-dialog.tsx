"use client";

import { SinkIcon } from "@/app/app/_components/frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { $api } from "@/lib/api/openapi-clients";
import { CreateSinkBody, Sink } from "@/lib/api/sscrub-api-schema";
import { SinkType } from "@/lib/media";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon } from "lucide-react";
import { useState } from "react";

const SINK_TYPES = ["camera", "action", "drone", "phone", "audio"] as const;

const SINK_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#84cc16",
  "#f59e0b",
  "#f97316",
  "#f43f5e",
  "#ec4899",
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

const emptyForm = (): CreateSinkBody => ({
  name: "",
  model: "",
  type: "camera",
  color: SINK_COLORS[0],
});

export function SinkDialog({
  sink,
  trigger,
}: {
  sink?: Sink;
  trigger: React.ReactElement;
}) {
  const editing = !!sink;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateSinkBody>(emptyForm);

  const onError = (err: { error?: string } | undefined) =>
    toast.add({
      type: "error",
      title: editing ? "Could not save sink" : "Could not create sink",
      description: err?.error,
    });

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["get", "/api/sinks"] });
    queryClient.invalidateQueries({ queryKey: ["get", "/api/sinks/{id}"] });
    setOpen(false);
  };

  const create = $api.useMutation("post", "/api/sinks", { onSuccess, onError });
  const update = $api.useMutation("put", "/api/sinks/{id}", {
    onSuccess,
    onError,
  });
  const pending = create.isPending || update.isPending;

  const set = <K extends keyof CreateSinkBody>(k: K, v: CreateSinkBody[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const valid = form.name.trim() !== "" && form.model.trim() !== "";

  const submit = (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!valid || pending) return;
    const body = { ...form, name: form.name.trim(), model: form.model.trim() };
    if (sink) update.mutate({ params: { path: { id: sink.id } }, body });
    else create.mutate({ body });
  };

  const customColor = !SINK_COLORS.includes(form.color);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o)
          setForm(
            sink
              ? {
                  name: sink.name,
                  model: sink.model,
                  type: sink.type,
                  color: sink.color,
                }
              : emptyForm(),
          );
        setOpen(o);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit sink" : "New sink"}</DialogTitle>
            <DialogDescription>
              A sink is one recording device. Everything dumped into it lands on
              its own track.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sink-name">Name</Label>
                <Input
                  id="sink-name"
                  placeholder="C-Cam"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sink-model">Model</Label>
                <Input
                  id="sink-model"
                  placeholder="Sony FX3"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Device type</Label>
              <div className="grid grid-cols-5 gap-1.5">
                {SINK_TYPES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("type", k)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-md py-2.5 text-[0.65rem] capitalize text-muted-foreground ring-1 ring-inset ring-hairline hover:bg-white/4 hover:text-foreground",
                      form.type === k &&
                        "ring-primary bg-primary/10 text-foreground",
                    )}
                  >
                    <SinkIcon type={k as SinkType} className="size-4" />
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {SINK_COLORS.map((c) => (
                  <ColorSwatch
                    key={c}
                    color={c}
                    selected={form.color === c}
                    onClick={() => set("color", c)}
                  />
                ))}
                <label
                  title="Custom color"
                  className={cn(
                    "relative size-6 rounded-md cursor-pointer ring-1 ring-inset ring-hairline flex items-center justify-center overflow-hidden",
                    customColor && "ring-2 ring-foreground ring-offset-0",
                  )}
                  style={{
                    background: customColor
                      ? form.color
                      : "conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #8b5cf6, #f43f5e)",
                  }}
                >
                  {customColor && <CheckIcon className="size-3 text-white" />}
                  <input
                    type="color"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    value={HEX_RE.test(form.color) ? form.color : "#ffffff"}
                    onChange={(e) => set("color", e.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!valid || pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {editing ? "Save changes" : "Create sink"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ColorSwatch({
  color,
  selected,
  onClick,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={color}
      onClick={onClick}
      className={cn(
        "size-6 rounded-md flex items-center justify-center ring-inset",
        selected && "ring-2 ring-foreground",
      )}
      style={{ background: color }}
    >
      {selected && <CheckIcon className="size-3 text-white" />}
    </button>
  );
}
