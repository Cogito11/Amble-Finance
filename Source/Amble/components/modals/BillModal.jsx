import React, { useState } from "react";
import { Trash2, CheckCircle2, Undo2, AlertCircle, X } from "lucide-react";
import { Modal } from "../common/Modal";
import { FormHint } from "../common/FormHint";
import { checkBillForm } from "../../state/inputs";
import { blurOnWheel } from "../../utils/misc";
import { todayStr } from "../../utils/dates";
import { fmt, fmtDate } from "../../utils/format";
import {
  FREQUENCY_OPTIONS, billCategorySnapshot, describeBillChanges, isSeries, linkableTransactions, nextSegmentStart, occurrenceStatus, pickOccurrence,
} from "../../state/planning";

// Editing a recurring bill works like a repeating calendar event:
//  - the "This occurrence" card at the top (paid / undo / linked transaction) always
//    applies to the one occurrence that was clicked, immediately;
//  - changing the bill's details asks whether the change applies "this and following"
//    (the default) or to "all" occurrences. Date / frequency / end-date changes can
//    only apply from this occurrence onward.
function ScopeOption({ value, title, desc, disabled, scope, setScope }) {
  return (
    <label className={`bill-scope-opt ${scope === value ? "active" : ""} ${disabled ? "disabled" : ""}`}>
      <input type="radio" name="bill-scope" value={value} checked={scope === value} disabled={disabled} onChange={() => setScope(value)} />
      <span>
        <b>{title}</b>
        <span className="muted bill-scope-desc">{desc}</span>
      </span>
    </label>
  );
}

export function BillModal({
  initial, occurrenceDate, bills, transactions, accounts, categories, budgets,
  onSave, onClose, onDelete, onMarkPaid, onUnmarkPaid, onLinkTransaction, onAssignTransaction,
}) {
  const isEdit = !!initial.id;
  const today = todayStr();
  // Frozen at open: the form is edited against this, while `initial` stays live
  // (so the occurrence card reflects paid marks as they are made).
  const [original] = useState(initial);
  const [occDate] = useState(() => (isEdit ? pickOccurrence(initial, today, occurrenceDate) : null));

  const [name, setName] = useState(initial.name || "");
  const [type, setType] = useState(initial.type || "expense");
  const [amount, setAmount] = useState(initial.amount ?? "");
  const openAccounts = accounts.filter((a) => !a.closed);
  const [accountId, setAccountId] = useState(initial.accountId || openAccounts[0]?.id || accounts[0]?.id || "");
  const [categoryId, setCategoryId] = useState(initial.categoryId || "");
  // For a recurring bill the date field is the date of the occurrence being edited.
  const [dueDate, setDueDate] = useState(isEdit ? (initial.recurring ? occDate : initial.dueDate) : todayStr());
  const [recurring, setRecurring] = useState(initial.recurring ?? false);
  const [frequency, setFrequency] = useState(initial.frequency || "monthly");
  const [hasEndDate, setHasEndDate] = useState(!!initial.endDate);
  const [endDate, setEndDate] = useState(initial.endDate || "");
  const [notes, setNotes] = useState(initial.notes || "");

  const [step, setStep] = useState("form"); // "form" | "scope" | "delete"
  const [scope, setScope] = useState("following");
  const [error, setError] = useState("");

  // A category mirrored from a budget (planId set) should only be selectable
  // while that budget is the active one - same rule TransactionModal applies.
  // A bill already pointing at a category from a since-deactivated budget still
  // shows it (so editing an older bill doesn't silently lose its category name),
  // but it can't be newly picked for anything else.
  const activeBudgetId = (budgets || []).find((b) => b.active)?.id;
  const isSelectable = (c) => !c.planId || c.planId === activeBudgetId;
  const parentCategories = categories.filter((c) => c.type === type && !c.parentCategoryId && (isSelectable(c) || c.id === categoryId));

  const check = checkBillForm({ name, amount, accountId, dueDate, recurring, hasEndDate, endDate });
  const canSave = check.valid;
  const wasRecurring = isEdit && !!original.recurring;

  const buildValues = () => ({
    name: name.trim(),
    type,
    amount: check.amount ?? 0,
    accountId,
    categoryId: categoryId || null,
    // Remembered so the category can be found by name after its budget rolls over (see resolveBillCategoryId).
    ...billCategorySnapshot(categoryId, categories),
    dueDate,
    recurring,
    frequency: recurring ? frequency : null,
    endDate: recurring && hasEndDate && endDate ? endDate : null,
    notes: notes.trim(),
  });

  const save = (chosenScope) => {
    const res = onSave({ values: buildValues(), billId: isEdit ? original.id : null, dateKey: occDate, scope: chosenScope });
    if (res && res.error) { setError(res.error); setStep("form"); }
  };

  const changes = wasRecurring && canSave ? describeBillChanges(original, buildValues(), occDate) : null;

  const submit = () => {
    if (!canSave) return;
    setError("");
    if (!wasRecurring) { save("following"); return; }
    if (!changes.any) { onClose(); return; }
    // Only the end date moved: there is nothing to choose between.
    if (changes.endChanged && !changes.fieldsChanged && !changes.planChanged) { save("following"); return; }
    setScope("following");
    setStep("scope");
  };

  const startDelete = () => {
    if (isEdit && isSeries(bills, original)) { setError(""); setScope("following"); setStep("delete"); }
    else onDelete(original.id);
  };

  const laterStart = isEdit ? nextSegmentStart(bills, original) : null;
  const dateNote = (key) => fmtDate(key);

  // ---- this-occurrence card ---------------------------------------------------
  const live = initial;
  const completion = isEdit && live.completions ? live.completions[occDate] : undefined;
  const status = isEdit ? occurrenceStatus(live, occDate, today) : null;
  const paid = status === "paid";
  const doneWord = live.type === "income" ? "received" : "paid";
  const linkedTx = typeof completion === "string" ? transactions.find((t) => t.id === completion) : null;
  const statusText = paid
    ? `${doneWord[0].toUpperCase()}${doneWord.slice(1)}${linkedTx ? ` · linked to ${linkedTx.description || "a transaction"} (${fmt(linkedTx.amount)})` : " · marked manually"}`
    : status === "overdue" ? "Overdue" : "Upcoming";

  const occurrenceCard = isEdit && (
    <div className={`bill-occ ${paid ? "bill-occ-paid" : status === "overdue" ? "bill-occ-overdue" : ""}`}>
      <div className="bill-occ-head">
        <div style={{ minWidth: 0 }}>
          <div className="bill-occ-title">{original.recurring ? "This occurrence" : "Status"} · {fmtDate(occDate)}</div>
          <div className="bill-occ-status">{statusText}</div>
        </div>
        {paid ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onUnmarkPaid(live.id, occDate)}><Undo2 size={13} /> Undo</button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onMarkPaid(live.id, occDate)}><CheckCircle2 size={13} /> Mark {doneWord}</button>
        )}
      </div>
      {!paid && (
        <select
          className="select plan-link-select"
          value=""
          aria-label={`Link a transaction to ${live.name}`}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            if (v === "__new__") onAssignTransaction(live, occDate);
            else onLinkTransaction(live.id, occDate, v);
          }}
        >
          <option value="" disabled>Link an existing transaction…</option>
          {linkableTransactions(transactions, bills, live, occDate).map((t) => (
            <option key={t.id} value={t.id}>{fmtDate(t.date)} · {t.description || "—"} · {fmt(t.amount)}</option>
          ))}
          <option value="__new__">+ Create a new transaction for this</option>
        </select>
      )}
    </div>
  );

  // ---- scope / delete steps ---------------------------------------------------
  const scopeLocked = changes ? (changes.planChanged || changes.endChanged) : false;
  const laterNote = laterStart ? ` A later version starting ${dateNote(laterStart)} is kept as it is.` : "";

  if (step === "scope") {
    return (
      <Modal title="Apply changes to…" onClose={onClose}>
        <div className="modal-body">
          <p className="settings-desc" style={{ margin: 0 }}>
            You changed the {changes.labels.join(", ")} of “{original.name}”. This is a repeating bill, so choose which occurrences get the change.
          </p>
          <div className="bill-scope-list">
            <ScopeOption
              scope={scope}
              setScope={setScope}
              value="following"
              title="This and following"
              desc={`From ${dateNote(occDate)} onward. Earlier occurrences keep their details and payment history.${laterNote}`}
            />
            <ScopeOption
              scope={scope}
              setScope={setScope}
              value="all"
              title="All occurrences"
              desc={scopeLocked ? "Not available: date, frequency and end-date changes can only apply from this occurrence onward." : "Every occurrence, past and future, gets the new details. Payment history is kept."}
              disabled={scopeLocked}
            />
          </div>
        </div>
        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep("form")}>Back</button>
            <button className="btn btn-primary" onClick={() => save(scope)}>Save changes</button>
          </div>
        </div>
      </Modal>
    );
  }

  if (step === "delete") {
    return (
      <Modal title="Delete repeating bill" onClose={onClose}>
        <div className="modal-body">
          <p className="settings-desc" style={{ margin: 0 }}>
            Which occurrences of “{original.name}” should be deleted? Transactions already linked to them are kept, just unlinked. This can't be undone.
          </p>
          <div className="bill-scope-list">
            <ScopeOption
              scope={scope}
              setScope={setScope}
              value="following"
              title="This and following"
              desc={`${dateNote(occDate)} onward. Earlier occurrences and their payment history are kept.${laterNote}`}
            />
            <ScopeOption
              scope={scope}
              setScope={setScope}
              value="all"
              title="All occurrences"
              desc="The whole bill, including every past occurrence and its payment history."
            />
          </div>
        </div>
        <div className="modal-footer">
          <span />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setStep("form")}>Back</button>
            <button className="btn btn-danger" onClick={() => onDelete(original.id, scope, occDate)}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isEdit ? "Edit bill" : "New bill"} onClose={onClose}>
      <div className="modal-body">
        {error && (
          <div className="inline-error">
            <AlertCircle size={14} />
            <span style={{ flex: 1 }}>{error}</span>
            <button type="button" className="icon-btn" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}
        {occurrenceCard}
        <div className="seg">
          {["expense", "income"].map((t) => (
            <button key={t} className={`seg-btn ${type === t ? "active" : ""}`} onClick={() => { setType(t); setCategoryId(""); }}>{t}</button>
          ))}
        </div>
        <div className="form-group">
          <label>Name</label>
          <input className="input" placeholder="e.g. Rent, Netflix, Paycheck" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Amount</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" className="input mono" value={amount} onChange={(e) => setAmount(e.target.value)} onWheel={blurOnWheel} />
          </div>
          <div className="form-group">
            <label>{wasRecurring ? "Due date · this occurrence" : recurring ? "Starting due date" : "Due date"}</label>
            <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Account</label>
            <select className="select" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.filter((a) => !a.closed || a.id === accountId).map((a) => <option key={a.id} value={a.id}>{a.name}{a.closed ? " (Closed)" : ""}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Category</label>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {parentCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Repeats
        </label>
        {recurring && (
          <>
            <div className="form-group">
              <label>Frequency</label>
              <select className="select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQUENCY_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={hasEndDate} onChange={(e) => setHasEndDate(e.target.checked)} />
              Stop repeating after a date
            </label>
            {hasEndDate && (
              <div className="form-group">
                <label>End date</label>
                <input type="date" className="input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
          </>
        )}
        {wasRecurring && (
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
            Saving changes to a repeating bill asks whether they apply to this and following occurrences, or to all of them.
          </p>
        )}
        <div className="form-group">
          <label>Notes <span className="muted">· optional</span></label>
          <input className="input" placeholder="e.g. Autopay on the 3rd" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <FormHint check={check} />
      </div>
      <div className="modal-footer">
        {isEdit ? <button className="btn btn-ghost tone-rust" onClick={startDelete}><Trash2 size={14} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>Save bill</button>
        </div>
      </div>
    </Modal>
  );
}
