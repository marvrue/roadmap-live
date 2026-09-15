# Zielprüfungen an festen Arbeitspunkten

Stand: 2026-09-15. Umsetzung der im Gespräch vereinbarten ersten Lieferung.

## Problem und Ziel

Marvin baut das Werkzeug zunächst für sich, verliert bei der Arbeit mit Coding-Agents den Überblick und möchte schneller ein vereinbartes Ergebnis erreichen; externe Nutzer und zahlende Kunden gibt es noch nicht.
Vor dem nächsten Arbeitsschritt müssen aktueller Meilenstein, Umfangsänderungen und fehlende Abnahmen sichtbar sein.

## Erste Lieferung

- Ein expliziter `focus` wählt einen Meilenstein mit Begründung, ohne die Meilensteinreihenfolge zu verändern; `baseline` hält Ergebnis, Begrenzung, Aufgabentitel, Kriterien und numerische Zielwerte fest.
- Meilensteine dürfen `outcome` und `limit` tragen; numerische `goal`-Felder bleiben ausschließlich auf Items.
- Items dürfen `acceptance: [{id, text, evidence?}]` tragen; `evidence` ist eine dokumentierte Aussage mit Verweis auf einen Test oder eine Beobachtung, kein automatisch verifizierter Beweis.
- `focus --milestone <id> --reason <text>` vereinbart einen Umfang; eine erneute Umfangsvereinbarung erfordert wieder eine ausdrückliche Begründung.
- `checkpoint --event start|complete|scope|milestone|check [--item <id>]` prüft und speichert das letzte Ergebnis; Exit 0 heißt Regeln erfüllt oder bei allgemeiner Prüfung nicht aktiviert, 2 bedeutet Klärungsbedarf, 1 ungültige Eingaben/Datei.
- `--dry-run` schreibt nichts und eignet sich für CI. Status und `updated` der Items bleiben Sache des Agents und von Sync.
- Live und statische Seite berechnen die aktuellen Befunde mit demselben reinen Modul wie die CLI; gespeicherte Prüfungen gelten nur für den exakt erfassten Roadmap-Ausschnitt.

## Feste Auslöser

1. Vor `active`: Startprüfung mit Item-ID.
2. Vor `done`: Abschlussprüfung mit Item-ID und Nachweisen.
3. Bei neuen/entfernten/geänderten Aufgaben oder Kriterien: Umfangsprüfung gegen die Baseline.
4. Vor Abschluss eines Meilensteins: alle Items erledigt und alle Kriterien mit Nachweisen.
5. Jede Aktualisierung der Live-Seite berechnet die allgemeinen Befunde erneut; CI prüft denselben Stand vor der Zusammenführung von Änderungen.

Der Agent beurteilt dabei auch fachlich den Diff und die Verweise. Die automatischen Regeln führen keinen KI-Aufruf aus und behaupten keine fachliche Abnahme. Das System startet und stoppt keine Agents. Zeit- und Tokenbudgets, Plattform-Hooks und die Zusammenführung mehrerer Worktrees bleiben eigenständige Folgeschritte.

## Abnahme und Durchführung

Die Items `checkpoint-core`, `checkpoint-page` und `checkpoint-workflow` in `roadmap.json` enthalten die einzeln prüfbaren Lieferkriterien. Implementierung in dieser Reihenfolge, jeweils nur ein aktives Item. Tests decken fehlende Kriterien, Umfangswachstum, Fragen, Review-Punkte, unerreichte Ziele, veraltete Ergebnisse, Wiederholungen und alte Roadmaps ab. Eine eigene Test-Roadmap durchläuft Start, fehlgeschlagenen Abschluss, Nachweis und erfolgreichen Abschluss. Der anschließende Fünf-Tage-Versuch bleibt offen, bis Marvin tatsächliche Nutzung berichtet.

## Dokumentation und Grenzen

`roadmap.json` trägt den aktuellen Vertrag; dieses Dokument erklärt die Regeln; `AGENTS.md` und README beschreiben den Ablauf. Prüfberichte überschreiben nur `checkpoint`, niemals Kommentare oder Sync-Felder. Dateiänderungen verwenden atomaren Ersatz und prüfen auf zwischenzeitliche Änderungen; die vorhandene grundsätzliche Konkurrenz mit externen Dateischreibern bleibt durch den separaten Sync-/Worktree-Plan zu lösen. Keine neue Abhängigkeit, kein Build, Node >=18, Englisch und Deutsch.

Offene Produktfrage für den Praxistest: Wie oft erzeugen die Regeln einen hilfreichen Entscheidungspunkt, und wie oft nur Unterbrechung? Mangels bisherigen Nutzungsdaten gibt es dafür noch keine gemessene Verbesserung.
