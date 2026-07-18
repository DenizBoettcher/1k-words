import { useState } from 'react';
import {
  Modal, Stack, Text, TextInput, Textarea, Button, FileButton, Alert, Code, CopyButton, Group,
} from '@mantine/core';
import { IconUpload, IconCheck, IconCopy } from '@tabler/icons-react';
import { patchList, uploadGrammar } from '../utils/listsApi';

const GRAMMAR_PROMPT = `Create grammar (cloze) exercises for my vocabulary list as a single JSON file:

[
  { "text": "ich ___ heute eine Serie",
    "answers": ["schaue", "schauen"],
    "words": ["schauen", "heute"] }
]

Rules:
- "text": a sentence in the LEARNING language with exactly one ___ gap.
- "answers": every accepted fill the correctly conjugated form AND the base form.
- "words": the BASE FORMS of the vocabulary words the sentence uses (first = the gap word).
  Use exactly the base forms from my word list so they can be linked.
- 20-40 sentences, everyday situations, no numbering, JSON only.`;

interface RenameProps {
  list: { id: number; title: string; description?: string } | null;
  onClose: (changed: boolean) => void;
}

/** Small owner modal: rename a list / edit its description. */
export function RenameListModal({ list, onClose }: RenameProps) {
  const [title, setTitle] = useState(list?.title ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!list || !title.trim()) return;
    setBusy(true); setError('');
    try {
      await patchList(list.id, { title: title.trim(), description: description.trim() });
      onClose(true);
    } catch (e: any) {
      setError(e?.message ?? 'Rename failed'); setBusy(false);
    }
  };

  return (
    <Modal opened={!!list} onClose={() => onClose(false)} title="Rename list" centered>
      <Stack gap="sm">
        <TextInput label="Title" value={title} maxLength={120}
          onChange={(e) => setTitle(e.currentTarget.value)} data-autofocus />
        <Textarea label="Description" value={description} maxLength={500} autosize minRows={2}
          onChange={(e) => setDescription(e.currentTarget.value)} />
        {error && <Alert color="red">{error}</Alert>}
        <Button onClick={save} loading={busy} disabled={!title.trim()}>Save</Button>
      </Stack>
    </Modal>
  );
}

interface GrammarProps {
  list: { id: number; title: string } | null;
  onClose: () => void;
}

/** Owner modal: explains the grammar JSON format and uploads the file. */
export function GrammarUploadModal({ list, onClose }: GrammarProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const upload = async (file: File | null) => {
    if (!file || !list) return;
    setBusy(true); setMessage(null);
    try {
      const parsed = JSON.parse(await file.text());
      const { count, unresolvedWordRefs } = await uploadGrammar(list.id, parsed);
      setMessage({
        kind: 'ok',
        text: `${count} exercises saved.` +
          (unresolvedWordRefs > 0
            ? ` ${unresolvedWordRefs} word reference(s) didn't match any word in the list their hints/links are skipped.`
            : ''),
      });
    } catch (e: any) {
      setMessage({ kind: 'err', text: e?.message ?? 'Upload failed' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={!!list} onClose={onClose} title={`Grammar ${list?.title ?? ''}`} centered size="lg">
      <Stack gap="sm">
        <Text fz="sm">
          Upload a <b>separate JSON file</b> with sentence exercises. Each entry has a
          sentence with a <Code>___</Code> gap, the accepted <b>answers</b> (conjugated
          + base form), and <b>words</b>: the base forms of the vocabulary used  
          they're linked to your word list, so translations of words you haven't
          learned yet appear as hints while studying. Uploading replaces the
          previous exercises.
        </Text>
        <Code block fz="xs">{`[
  { "text": "ich ___ heute eine Serie",
    "answers": ["schaue", "schauen"],
    "words": ["schauen", "heute"] }
]`}</Code>
        <Group gap="xs">
          <CopyButton value={GRAMMAR_PROMPT}>
            {({ copied, copy }) => (
              <Button size="xs" variant="light" onClick={copy}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}>
                {copied ? 'Copied' : 'Copy AI prompt'}
              </Button>
            )}
          </CopyButton>
          <FileButton onChange={upload} accept="application/json">
            {(props) => (
              <Button size="xs" leftSection={<IconUpload size={14} />} loading={busy} {...props}>
                Upload grammar JSON
              </Button>
            )}
          </FileButton>
        </Group>
        {message && <Alert color={message.kind === 'ok' ? 'teal' : 'red'}>{message.text}</Alert>}
      </Stack>
    </Modal>
  );
}
