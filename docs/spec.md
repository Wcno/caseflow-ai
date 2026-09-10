# CaseFlow AI MVP specification

Build a Spanish local web application for bank collaborators that transforms a
synthetic text or voice claim into an editable prepared claim. The pipeline must
transcribe locally, retrieve a synthetic procedure, classify and extract facts,
derive missing information, recommend the responsible area, and generate a
summary and response draft. A collaborator confirms the result before it is
stored locally.

The implementation must use `@qvac/sdk@0.19.0` for every inference operation,
run offline after model preparation, preserve no audio, reject invalid model
output without inventing a fallback result, and measure warm end-to-end latency
against the 120-second target. The hero scenario is an ATM cash withdrawal that
debited the account without dispensing cash and omits the ATM identifier and
approximate time.

