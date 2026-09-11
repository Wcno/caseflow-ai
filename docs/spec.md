# CaseFlow AI MVP specification

Build a Spanish local web application for bank collaborators that transforms a
synthetic text or voice claim into an editable prepared claim. The pipeline must
transcribe locally, retrieve a synthetic procedure, classify and extract facts,
derive missing information, recommend the responsible area, and generate a
summary and response draft. A collaborator confirms the result before it is
stored locally.

The local vertical slice also demonstrates an operational case lifecycle after
reception. A stable human-readable tracking number is issued before inference;
customer reference candidates explicitly present in the intake may be extracted
locally, but remain pending until an operator confirms them. Synthetic customer
reference data is structured separately from extracted
incident facts; an operator confirms area and assignee; an assigned specialist
records investigation steps, evidence, resolution and response; simulated
delivery closes the case. Business status, responsibility, dates and immutable
case events are visible in a case inbox and detail view.

Customer tracking accepts the tracking number plus the final four digits of the
synthetic national identifier and returns only a reduced customer-safe view.
Procedure documentation, privacy diagnostics, staff, communications and seeded
cases are local and synthetic. No WhatsApp, telephony, bank-core or cloud-AI
integration is permitted by this specification.

Before choosing a procedure, intake receives one of three dispositions:
applicable, needs clarification, or not applicable. Opinions, insults, political
comments and unrelated platform problems must not create an invented banking
procedure. A possibly banking-related but incomplete report asks for concrete
clarification. Both outcomes are user guidance, not system failures, and retain
the local transcript for review.

Voice intake must make its state obvious: recording in progress, audio ready for
local transcription, and transcription completed. The completed transcript is
shown prominently so the collaborator can review it before confirming anything.

The implementation must use `@qvac/sdk@0.19.0` for every inference operation,
run offline after model preparation, preserve no audio, reject invalid model
output without inventing a fallback result, and measure warm end-to-end latency
against the 120-second target. The hero scenario is an ATM cash withdrawal that
debited the account without dispensing cash and omits the ATM identifier and
approximate time.
