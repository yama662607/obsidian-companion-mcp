# MCP Lifecycle, Metadata, and Maintenance Tools

このドキュメントは、検索・read・edit 以外の public tools を定義します。

## Tool Set

- `create_note`
- `patch_note_metadata`
- `move_note`
- `delete_note`

## `create_note`

**Purpose**  
新しい markdown note を作成する。

**Description**  
Create a markdown note at a vault-relative path.

**Input**

```json
{
  "path": "Projects/Alpha/Retro.md",
  "content": "# Retro\n..."
}
```

**Output**

```json
{
  "note": {
    "path": "Projects/Alpha/Retro.md"
  },
  "created": true,
  "degraded": false,
  "degradedReason": null
}
```

## `patch_note_metadata`

**Purpose**  
frontmatter を structured patch として更新する。

**Description**  
Patch note frontmatter without editing markdown body content.

**Input**

```json
{
  "note": "Projects/Alpha/Retro.md",
  "metadata": {
    "status": "active",
    "tags": ["retro", "alpha"]
  }
}
```

**Output**

```json
{
  "note": {
    "path": "Projects/Alpha/Retro.md"
  },
  "metadata": {
    "status": "active",
    "tags": ["retro", "alpha"]
  },
  "degraded": false,
  "degradedReason": null
}
```

**Notes**

- body content edit はしない
- frontmatter の構造は保持する

## `move_note`

**Purpose**  
note を vault 内で rename / move する。

**Description**  
Move or rename a note within the vault root.

**Input**

```json
{
  "from": "1_Inbox/Idea.md",
  "to": "4_Active/Idea.md"
}
```

**Output**

```json
{
  "from": "1_Inbox/Idea.md",
  "to": "4_Active/Idea.md",
  "degraded": false,
  "degradedReason": null
}
```

## `delete_note`

**Purpose**  
note を削除する。

**Description**  
Delete a note by vault-relative path.

**Input**

```json
{
  "note": "4_Active/Idea.md"
}
```

**Output**

```json
{
  "note": {
    "path": "4_Active/Idea.md"
  },
  "deleted": true,
  "degraded": false,
  "degradedReason": null
}
```

**Notes**

- destructive tool
- missing note は `NOT_FOUND`
