import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { formatRemaining, parseDelay, preview } from "./core.mjs";
import { isMinutesDraft } from "./minutes.ts";

const STATUS_KEY = "delay-prompt";
const OVERLAY_WIDTH = 56;

type PendingImage = { type: string; [key: string]: unknown };

export default function delayPrompt(pi: ExtensionAPI) {
	let armedMs: number | null = null;
	let counting = false;

	function setArmed(ctx: ExtensionContext, ms: number | null) {
		armedMs = ms;
		try {
			ctx.ui.setStatus(STATUS_KEY, ms === null ? undefined : `delay ${formatRemaining(ms)} armed`);
		} catch {
			// Status footer may be unavailable; the notify below still informs the user.
		}
	}

	async function askMinutes(ctx: ExtensionContext): Promise<number | null> {
		if (ctx.mode !== "tui" || !ctx.hasUI) {
			ctx.ui.notify("Delay needs interactive terminal mode.", "error");
			return null;
		}
		return ctx.ui.custom<number | null>((tui, theme, _kb, done) => {
			const input = new Input({ prompt: "Minutes: ", placeholder: "e.g. 5 or 1.5" });
			const presets = ["1", "5", "10", "30"];
			let preset = -1;
			let error = "";
			let paste: string | null = null;
			input.onEscape = () => done(null);
			input.onSubmit = raw => {
				const parsed = parseDelay(raw);
				if (isMinutesDraft(raw) && parsed.ok && parsed.ms !== undefined) done(parsed.ms);
				else { error = "Choose 1 second to 180 minutes (e.g. 0.5)."; tui.requestRender(); }
			};
			return {
				get focused() { return input.focused; },
				set focused(value: boolean) { input.focused = value; },
				render(width: number) {
					const line = (text: string) => truncateToWidth(text, width);
					return [
						line(theme.fg("accent", "─".repeat(width))),
						line(theme.fg("text", "Delay duration — minutes, not prompt text")),
						line(theme.fg("muted", "Your prompt stays in the main editor.")),
						"",
						...input.render(width),
						line(theme.fg("muted", "Quick presets (Tab): 1 / 5 / 10 / 30 min")),
						line(theme.fg(error ? "warning" : "dim", error || "Digits + one decimal point only. Max 180 min.")),
						line(theme.fg("dim", "Enter apply · Esc / Ctrl+C cancel")),
						line(theme.fg("accent", "─".repeat(width))),
					];
				},
				handleInput(data: string) {
					// Validate complete pasted text before Input can normalize newlines.
					if (data.includes("\x1b[200~")) paste = "";
					if (paste !== null) {
						paste += data.replace("\x1b[200~", "");
						const end = paste.indexOf("\x1b[201~");
						if (end < 0) return;
						const text = paste.slice(0, end);
						paste = null;
						if (!isMinutesDraft(text)) {
							error = "Paste a number in minutes, not prompt text.";
							tui.requestRender(); return;
						}
						data = `\x1b[200~${text}\x1b[201~`;
					}
					if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { done(null); return; }
					if (matchesKey(data, Key.tab)) {
						preset = (preset + 1) % presets.length;
						input.setValue(presets[preset]);
						error = ""; tui.requestRender(); return;
					}
					const previous = input.getValue();
					error = "";
					input.handleInput(data);
					if (!isMinutesDraft(input.getValue())) {
						input.setValue(previous);
						error = "Numbers only — write your prompt in the main editor.";
					}
					tui.requestRender();
				},
				invalidate() { input.invalidate(); },
			};
		}, { overlay: true, overlayOptions: { anchor: "center", width: 64 } });
	}

	function countdownLines(theme: any, text: string, remainingMs: number): string[] {
		const line = (s: string) => truncateToWidth(s, OVERLAY_WIDTH);
		return [
			line(theme.fg("accent", "─".repeat(OVERLAY_WIDTH))),
			line(theme.fg("text", ` Sending in ${formatRemaining(remainingMs)} — delayed prompt`)),
			line(theme.fg("muted", ` ${preview(text)}`)),
			line(""),
			line(theme.fg("dim", " Enter send now · Esc cancel (restores editor)")),
			line(theme.fg("accent", "─".repeat(OVERLAY_WIDTH))),
		];
	}

	/** Show the countdown. Resolves true when the prompt should be sent. */
	async function countdown(ctx: ExtensionContext, text: string, delayMs: number): Promise<boolean> {
		if (ctx.mode !== "tui" || !ctx.hasUI) {
			ctx.ui.notify("Delay needs interactive terminal mode.", "error");
			return false;
		}
		const deadline = Date.now() + delayMs;
		return ctx.ui.custom<boolean>((tui, theme, _kb, done) => {
			let settled = false;
			const finish = (send: boolean) => {
				if (settled) return;
				settled = true;
				clearInterval(timer);
				done(send);
			};
			const timer = setInterval(() => {
				if (Date.now() >= deadline) finish(true);
				else tui.requestRender();
			}, 250);
			return {
				render: () => countdownLines(theme, text, deadline - Date.now()),
				handleInput: (data: string) => {
					if (matchesKey(data, Key.escape)) finish(false);
					else if (matchesKey(data, Key.enter)) finish(true);
				},
				invalidate: () => {},
				dispose: () => clearInterval(timer),
			};
		}, { overlay: true, overlayOptions: { anchor: "center", width: OVERLAY_WIDTH } });
	}

	async function runDelayed(ctx: ExtensionContext, text: string, images: PendingImage[] | undefined, delayMs: number) {
		if (counting) {
			// Never stack countdowns; let Pi queue this one normally.
			pi.sendUserMessage(images?.length ? [{ type: "text", text } as any, ...(images as any[])] : text);
			return;
		}
		counting = true;
		try {
			const send = await countdown(ctx, text, delayMs);
			if (send) {
				pi.sendUserMessage(images?.length ? [{ type: "text", text } as any, ...(images as any[])] : text);
			} else {
				try {
					ctx.ui.setEditorText(text);
				} catch {
					// Editor restore is best-effort outside interactive mode.
				}
				ctx.ui.notify("Delayed prompt cancelled — editor restored.", "info");
			}
		} finally {
			counting = false;
		}
	}

	pi.registerCommand("delay-prompt", {
		description: "Delay the next prompt, e.g. /delay-prompt 5 (minutes). /delay-prompt cancel disarms.",
		handler: async (args, ctx) => {
			const raw = args?.trim() ?? "";
			if (!raw) {
				const ms = await askMinutes(ctx);
				if (ms === null) return;
				setArmed(ctx, ms);
				ctx.ui.notify(`Next prompt delayed by ${formatRemaining(ms)}. Type it and press Enter.`, "info");
				return;
			}
			const parsed = parseDelay(raw);
			if (!parsed.ok) {
				ctx.ui.notify("Usage: /delay-prompt <minutes> (e.g. 5 or 1.5).", "warning");
				return;
			}
			if (parsed.cancel) {
				setArmed(ctx, null);
				ctx.ui.notify("Prompt delay disarmed.", "info");
				return;
			}
			setArmed(ctx, parsed.ms!);
			ctx.ui.notify(`Next prompt delayed by ${formatRemaining(parsed.ms!)}. Type it and press Enter.`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("d"), {
		description: "Delay the prompt currently in the editor (or arm the next one)",
		handler: async (ctx) => {
			if (ctx.mode !== "tui" || !ctx.hasUI) return;
			const current = ctx.ui.getEditorText();
			const ms = await askMinutes(ctx);
			if (ms === null) return;
			if (!current.trim()) {
				setArmed(ctx, ms);
				ctx.ui.notify(`Next prompt delayed by ${formatRemaining(ms)}. Type it and press Enter.`, "info");
				return;
			}
			setArmed(ctx, null);
			try {
				ctx.ui.setEditorText("");
			} catch {
				// Editor may already be submitted; countdown still holds the text.
			}
			await runDelayed(ctx, current, undefined, ms);
		},
	});

	pi.on("input", async (event, ctx) => {
		if (armedMs === null || counting) return;
		if (event.source !== "interactive") return;
		if (event.text.startsWith("/")) return; // never delay slash commands
		const delayMs = armedMs;
		setArmed(ctx, null);
		const text = event.text;
		const images = event.images as PendingImage[] | undefined;
		// Run after returning handled so the editor state settles first.
		void runDelayed(ctx, text, images, delayMs);
		return { action: "handled" };
	});
}
