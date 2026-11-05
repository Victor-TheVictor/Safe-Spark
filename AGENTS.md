SafeSpark — Project Instructions

1. Verified Map Baseline

The current Blue Light / Emergency Phone map has been manually verified against real-world locations.

The verified baseline is stored in Git commit:
673d91a642bad83e64ac5c1d65bf421edabd7701

This implementation is a protected part of the project.

2. Protected Files

public/emergencyPhones.geojson

public/emergencyPhones.json

src/components/safety-map/

src/components/safety-map/data/

3. Mandatory Rules

Never modify verified geographic coordinates without explicit approval.

Never regenerate, replace, or delete verified location datasets without approval.

Never replace the current map provider or coordinate system without approval.

Preserve marker positions and map accuracy during UI iterations.

Avoid unnecessary refactoring of protected map components.

Ask for explicit approval before modifying protected files.

After approved map changes, run regression tests to verify location accuracy.

Prefer modifying surrounding UI components instead of protected map logic.

4. Development Philosophy

Prioritize iterative development.

Make small, focused changes.

Preserve existing working functionality.

Do not redesign unrelated components.

Test before declaring a task complete.