import { describe, expect, it } from "vitest";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";
import {
  parseHelixAskDebugExportText,
  validateHelixAskNotesCreateDebugAcceptance,
} from "../scripts/helix-ask-notes-create-debug-acceptance";

const acceptedDebugExport = () => ({
  active_turn_id: "ask:notes-create-acceptance",
  selected_final_answer: "Note saved.",
  ask_turn_solver_trace: {
    schema: "helix.ask_turn_solver_trace.v1",
    turn_id: "ask:notes-create-acceptance",
    completed_solver_path: true,
    final_arbitration: {
      terminal_artifact_kind: "note_update_receipt",
      final_answer_source: "client_workstation_receipt",
    },
  },
  action_envelope: {
    schema: "helix.ask.action_envelope.v1",
    workstation_actions: [
      {
        panel_id: "workstation-notes",
        action_id: "create_note",
      },
    ],
  },
  workstation_gateway_call_results: [
    {
      capability_id: "workstation-notes.create_note",
    },
  ],
  agent_step_loop: {
    iterations: [
      {
        decision: {
          chosen_capability: "workstation-notes.create_note",
        },
      },
    ],
  },
  workspace_action_client_ack: [
    {
      turn_id: "ask:notes-create-acceptance",
      action_key: "workstation-notes.create_note",
      receipt_kind: "note_update_receipt",
      persisted: true,
      state_observed: true,
    },
  ],
  client_receipt_terminal: {
    turn_id: "ask:notes-create-acceptance",
    text: "Note saved.",
    receipt_kind: "note_update_receipt",
  },
  final_answer_source: "client_workstation_receipt",
  terminal_artifact_kind: "note_update_receipt",
});

describe("Helix Ask notes create debug acceptance", () => {
  it("passes only when the note create receipt lifecycle is visible", () => {
    expect(validateHelixAskNotesCreateDebugAcceptance(acceptedDebugExport())).toEqual({
      ok: true,
      diagnosis: "accepted",
      found: [
        "active_turn_id",
        "ask_turn_solver_trace.schema=helix.ask_turn_solver_trace.v1",
        "ask_turn_solver_trace.turn_id matches active_turn_id",
        "ask_turn_solver_trace.completed_solver_path=true",
        "ask_turn_solver_trace.final_arbitration.terminal_artifact_kind=note_update_receipt",
        "action_envelope.schema=helix.ask.action_envelope.v1",
        "action_envelope.workstation_actions[].panel_id=workstation-notes/action_id=create_note",
        "workstation_gateway_call_results[].capability_id=workstation-notes.create_note",
        "agent_step_loop.iterations[].chosen_capability=workstation-notes.create_note",
        "workspace_action_client_ack[].action_key=workstation-notes.create_note/receipt_kind=note_update_receipt/persisted=true/state_observed=true",
        "workspace_action_client_ack[].turn_id matches active_turn_id",
        "client_receipt_terminal.receipt_kind=note_update_receipt",
        "client_receipt_terminal.turn_id matches active_turn_id",
        "selected_final_answer equals client_receipt_terminal.text",
        "final_answer_source=client_workstation_receipt",
        "terminal_artifact_kind=note_update_receipt",
      ],
      missing: [],
      mismatched: [],
    });
  });

  it("fails when the visible answer lacks client persistence proof", () => {
    const payload = {
      ...acceptedDebugExport(),
      workspace_action_client_ack: [],
      client_receipt_terminal: null,
      final_answer_source: "model_prose",
      terminal_artifact_kind: "chat_final_answer",
    };

    const result = validateHelixAskNotesCreateDebugAcceptance(payload);

    expect(result.ok).toBe(false);
    expect(result.diagnosis).toBe("missing_client_persistence_receipt");
    expect(result.found).toEqual(expect.arrayContaining([
      "action_envelope.schema=helix.ask.action_envelope.v1",
      "action_envelope.workstation_actions[].panel_id=workstation-notes/action_id=create_note",
      "workstation_gateway_call_results[].capability_id=workstation-notes.create_note",
      "agent_step_loop.iterations[].chosen_capability=workstation-notes.create_note",
    ]));
    expect(result.missing).toEqual(expect.arrayContaining([
      "workspace_action_client_ack[].action_key=workstation-notes.create_note/receipt_kind=note_update_receipt/persisted=true/state_observed=true",
      "workspace_action_client_ack[].turn_id matches active_turn_id",
      "client_receipt_terminal.receipt_kind=note_update_receipt",
      "client_receipt_terminal.turn_id matches active_turn_id",
      "selected_final_answer equals client_receipt_terminal.text",
      "final_answer_source=client_workstation_receipt",
      "terminal_artifact_kind=note_update_receipt",
    ]));
  });

  it("rejects note receipts from a different Ask turn", () => {
    const payload = acceptedDebugExport();
    payload.workspace_action_client_ack[0].turn_id = "ask:other-turn";
    payload.client_receipt_terminal.turn_id = "ask:other-turn";

    const result = validateHelixAskNotesCreateDebugAcceptance(payload);

    expect(result.ok).toBe(false);
    expect(result.diagnosis).toBe("missing_client_persistence_receipt");
    expect(result.missing).toEqual(expect.arrayContaining([
      "workspace_action_client_ack[].turn_id matches active_turn_id",
      "client_receipt_terminal.turn_id matches active_turn_id",
    ]));
  });

  it("requires the client note receipt to prove observed state, not only persisted status", () => {
    const payload = acceptedDebugExport();
    payload.workspace_action_client_ack[0].state_observed = false;

    const result = validateHelixAskNotesCreateDebugAcceptance(payload);

    expect(result.ok).toBe(false);
    expect(result.diagnosis).toBe("missing_client_persistence_receipt");
    expect(result.missing).toEqual(expect.arrayContaining([
      "workspace_action_client_ack[].action_key=workstation-notes.create_note/receipt_kind=note_update_receipt/persisted=true/state_observed=true",
      "workspace_action_client_ack[].turn_id matches active_turn_id",
    ]));
  });

  it("fails when the note action was admitted but no completed solver trace is present", () => {
    const payload = acceptedDebugExport();
    payload.ask_turn_solver_trace = {
      schema: "helix.ask_turn_solver_trace.v1",
      turn_id: "ask:notes-create-acceptance",
      completed_solver_path: false,
      final_arbitration: {
        terminal_artifact_kind: "note_update_receipt",
      },
    };

    const result = validateHelixAskNotesCreateDebugAcceptance(payload);

    expect(result.ok).toBe(false);
    expect(result.diagnosis).toBe("missing_solver_trace");
    expect(result.missing).toEqual(expect.arrayContaining([
      "ask_turn_solver_trace.completed_solver_path=true",
    ]));
  });

  it("accepts provider agent-step iterations that expose chosen_capability at the top level", () => {
    const payload = acceptedDebugExport();
    payload.agent_step_loop = {
      iterations: [
        {
          chosen_capability: "workstation-notes.create_note",
        },
      ],
    };

    expect(validateHelixAskNotesCreateDebugAcceptance(payload)).toMatchObject({
      ok: true,
      diagnosis: "accepted",
    });
  });

  it("parses copied debug exports from fenced or pasted text", () => {
    const json = JSON.stringify(acceptedDebugExport(), null, 2);
    const fenced = parseHelixAskDebugExportText(`\uFEFF\n\`\`\`json\n${json}\n\`\`\``);
    const pasted = parseHelixAskDebugExportText(`debug export follows:\n${json}\nend`);

    expect(validateHelixAskNotesCreateDebugAcceptance(fenced).ok).toBe(true);
    expect(validateHelixAskNotesCreateDebugAcceptance(pasted).ok).toBe(true);
  });

  it("accepts the real copied debug-export envelope shape for a receipt-backed note create", () => {
    const text = buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "ask:notes-create-real-export",
        question: 'make a note for me "hh"',
        content: "Note saved.",
      },
      {
        selected_final_answer: "Note saved.",
        final_answer_source: "client_workstation_receipt",
        terminal_artifact_kind: "note_update_receipt",
        ask_turn_solver_trace: {
          schema: "helix.ask_turn_solver_trace.v1",
          turn_id: "ask:notes-create-real-export",
          completed_solver_path: true,
          final_arbitration: {
            terminal_artifact_kind: "note_update_receipt",
            final_answer_source: "client_workstation_receipt",
          },
        },
        action_envelope: {
          schema: "helix.ask.action_envelope.v1",
          workstation_actions: [
            {
              action: "run_panel_action",
              panel_id: "workstation-notes",
              action_id: "create_note",
              args: { body: "hh" },
            },
          ],
        },
        workstation_gateway_call_results: [
          {
            capability_id: "workstation-notes.create_note",
            ok: true,
          },
        ],
        agent_step_loop: {
          iterations: [
            {
              decision: {
                chosen_capability: "workstation-notes.create_note",
              },
            },
          ],
        },
        workspace_action_client_ack: [
          {
            turn_id: "ask:notes-create-real-export",
            item_id: "workstation-receipt:note-1",
            action_key: "workstation-notes.create_note",
            target_id: "workstation-notes",
            action_id: "create_note",
            applied: true,
            persisted: true,
            receipt_kind: "note_update_receipt",
            state_observed: true,
          },
        ],
        client_receipt_terminal: {
          turn_id: "ask:notes-create-real-export",
          text: "Note saved.",
          receipt_kind: "note_update_receipt",
          panel_id: "workstation-notes",
          action_id: "create_note",
          note_id: "note-1",
        },
        debug: {
          turn_id: "ask:notes-create-real-export",
        },
      },
    );

    const result = validateHelixAskNotesCreateDebugAcceptance(parseHelixAskDebugExportText(text));

    expect(result).toMatchObject({
      ok: true,
      diagnosis: "accepted",
      missing: [],
    });
  });

  it("diagnoses old exports with no admitted create-note action", () => {
    const result = validateHelixAskNotesCreateDebugAcceptance({
      selected_final_answer: "I cannot create that note from this turn.",
      final_answer_source: "model_prose",
      terminal_artifact_kind: "chat_final_answer",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnosis).toBe("missing_server_action_admission");
    expect(result.found).toEqual([]);
    expect(result.missing).toEqual(expect.arrayContaining([
      "action_envelope.schema=helix.ask.action_envelope.v1",
      "workstation_gateway_call_results[].capability_id=workstation-notes.create_note",
    ]));
  });

  it("prints machine-readable JSON from the CLI", () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-notes-acceptance-"));
    const exportPath = join(dir, "debug-export.json");
    writeFileSync(exportPath, JSON.stringify(acceptedDebugExport()), "utf8");

    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/helix-ask-notes-create-debug-acceptance.ts", "--json", exportPath],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      diagnosis: "accepted",
      missing: [],
    });
  });

  it("accepts a directory and selects the newest debug export candidate", () => {
    const dir = mkdtempSync(join(tmpdir(), "helix-notes-acceptance-dir-"));
    const oldPath = join(dir, "debug-export-old.json");
    const newPath = join(dir, "pasted-text.txt");
    writeFileSync(oldPath, JSON.stringify({ selected_final_answer: "old failure" }), "utf8");
    writeFileSync(newPath, JSON.stringify(acceptedDebugExport()), "utf8");

    const now = new Date();
    const old = new Date(now.getTime() - 5000);
    utimesSync(oldPath, old, old);
    utimesSync(newPath, now, now);

    const result = spawnSync(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", "scripts/helix-ask-notes-create-debug-acceptance.ts", "--json", dir],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      diagnosis: "accepted",
    });
  });
});
