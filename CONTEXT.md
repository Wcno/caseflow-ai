# CaseFlow AI

CaseFlow AI prepares an evidence-backed claim dossier for a bank collaborator
while keeping claim data and inference on the local device.

## Language

**Claim intake**:
The text or voice narrative submitted for preparation.
_Avoid_: Ticket, complaint form

**Claim run**:
One attempt to transform a claim intake into a prepared claim, including its
current stage and timings.
_Avoid_: Job, task

**Prepared claim**:
A structured, editable dossier containing the classification, procedure,
missing information, routing recommendation, summary, and response draft.
_Avoid_: AI decision, resolved claim

**Procedure**:
A synthetic, versioned set of internal handling instructions used to ground a
prepared claim.
_Avoid_: Policy, answer

**Responsible area**:
The internal team recommended by the selected procedure. A collaborator must
confirm it before the prepared claim is saved.
_Avoid_: Automatic assignment, owner

**Missing information**:
Procedure-required facts not found in the claim intake.
_Avoid_: Model suggestions

**Collaborator confirmation**:
The human action that accepts an edited prepared claim into local history.
_Avoid_: Automatic registration, submission to the bank

**Synthetic case**:
A fictional claim with no data belonging to a real customer or financial
institution.
_Avoid_: Sample customer, anonymized customer

