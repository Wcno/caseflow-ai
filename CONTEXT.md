# CaseFlow AI

CaseFlow AI prepares and follows a synthetic banking claim from reception through
closure while keeping claim data and inference on the local device.

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

**Operational case**:
The local record that follows a synthetic claim from reception through closure,
including its customer reference, assignment, resolution and immutable history.
_Avoid_: Prepared claim, claim run

**Tracking number**:
A stable, human-readable reference issued when an operational case is received
and used by the synthetic customer to consult its progress.
_Avoid_: Claim run ID, official bank case number

**Customer reference**:
Structured synthetic identity and contact metadata confirmed by a collaborator;
it is never inferred from the claim intake.
_Avoid_: Extracted fields, authenticated bank customer

**Customer reference candidate**:
Identity values explicitly present in a local intake and proposed by QVAC for
operator confirmation; it is not a confirmed customer reference.
_Avoid_: Inferred identity, automatic customer match

**Case status**:
The business stage of an operational case, distinct from the technical stage of
a claim run.
_Avoid_: Claim stage, inference status

**Case assignment**:
The collaborator-confirmed responsible area and manually selected synthetic
specialist responsible for the next action.
_Avoid_: AI assignment, routing recommendation

**Case event**:
An immutable, timestamped record of a meaningful operational-case change,
including the acting synthetic collaborator and reason when required.
_Avoid_: Editable note, application log

**Simulated communication**:
A locally recorded preview of a customer update that is never transmitted to an
external messaging or telephony provider.
_Avoid_: Sent message, WhatsApp integration

**Intake disposition**:
The local assessment that a claim intake is applicable to a procedure, needs
clarification, or is outside the synthetic catalog; it is not a technical error.
_Avoid_: System failure, invented procedure

**Operator**:
The synthetic collaborator role that receives claims, confirms customer
references, assigns cases and records simulated customer communications.
_Avoid_: Specialist, automated agent
