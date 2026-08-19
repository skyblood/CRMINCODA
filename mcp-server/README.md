# CRM Incoda MCP Server

Local (stdio) MCP server — no network ports. Claude launches it as a subprocess.

## Provenance note

This directory (including the `crear_oportunidad` tool) existed as uncommitted
working-tree changes before it was ever added to git. It was first committed in
`cd6236d` alongside 6 new read-only reporting tools added by the
[Junta Directiva de IA plan](../docs/superpowers/plans/2026-08-18-crm-mcp-board-readonly-tools-plan.md) —
that commit's message describes only the 6 new tools, but the diff includes the
whole directory's first appearance in version control. Recorded here for anyone
reading `git log` later and wondering why a "6 tools" commit shows ~1200 lines.

## Tools

- `crear_oportunidad` — creates a new lead/opportunity (write, pre-existing)
- `leer_pipeline_forecast`, `leer_financieros`, `leer_caja`, `leer_estado_mercury`,
  `leer_metas`, `leer_comisiones` — read-only board-reporting tools
