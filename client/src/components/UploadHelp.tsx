import { Modal, Stack, Text, Code, CopyButton, ActionIcon, Tooltip, Box } from '@mantine/core';
import { IconCopy, IconCheck } from '@tabler/icons-react';

const AI_PROMPT = `Create a vocabulary word list as a single JSON file in exactly this format:

{
  "title": "<short list title>",
  "sourceLang": "<ISO code of the language I already know, e.g. "de">",
  "targetLang": "<ISO code of the language I want to learn, e.g. "es">",
  "words": [
    { "<sourceLang>": "word in my language", "<targetLang>": "translation" },
    { "<sourceLang>": "a",  "<targetLang>": ["ein", "eine"] }
  ]
}

Rules:
- Use the two ISO codes as the JSON keys of every entry (e.g. "de" and "es").
- Pick the ~600 most useful/common words for a beginner-to-intermediate learner
  (1000 is often too much for one list  600 is a good size).
- One entry per word. If a word has several equally valid translations
  (e.g. gendered forms, articles: "ein"/"eine"), use a JSON ARRAY of strings
  as the value  every alternative counts as a correct answer.
- No duplicates, no numbering, no comments, no trailing commas.
- Respond with ONLY the JSON, nothing else.

My languages: source = ___ , target = ___`;

export default function UploadHelp({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="How to create a list JSON" size="lg">
      <Stack gap="sm">
        <Text fz="sm">
          A list is a single <b>.json</b> file: a title, two ISO language codes,
          and the word pairs. Two accepted shapes:
        </Text>
        <Code block fz="xs">{`{ "title": "Spanish Basics", "sourceLang": "en", "targetLang": "es",
  "words": [ { "en": "hello", "es": "hola" },
             { "en": "friend", "es": ["amigo", "amiga"] } ] }`}</Code>
        <Text fz="sm" c="dimmed">
          Alternatives (both accepted as correct) go in an array  a “/”-joined
          string like "amigo/amiga" works too. A bare array of two-language
          objects is also accepted.
        </Text>

        <Text fz="sm" mt="xs">
          <b>Let an AI write it for you.</b> Paste this prompt into Claude, ChatGPT
          or any other assistant, fill in your two languages, and upload the JSON
          it returns:
        </Text>

        <Box pos="relative">
          <CopyButton value={AI_PROMPT} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied!' : 'Copy prompt'} position="left">
                <ActionIcon
                  variant="light"
                  color={copied ? 'teal' : 'brand'}
                  onClick={copy}
                  pos="absolute"
                  top={8}
                  right={8}
                  style={{ zIndex: 2 }}
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
          <Code block fz="xs" style={{ whiteSpace: 'pre-wrap', paddingRight: 44 }}>
            {AI_PROMPT}
          </Code>
        </Box>
      </Stack>
    </Modal>
  );
}
