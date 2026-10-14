export const faqs = [
  {
    question: 'Which systems does Study Space run on?',
    answer:
      'The installer targets 64 bit Windows 10 and 11. It renders through Microsoft WebView2, which ships with Windows 11 and is already present on most Windows 10 machines.',
  },
  {
    question: 'Do I need an account or an internet connection?',
    answer:
      'No. Study Space runs entirely on your computer. There is no login, no sync server and nothing to sign up for.',
  },
  {
    question: 'Where are my notes and PDFs stored?',
    answer:
      'In a single folder under %LOCALAPPDATA%\\StudySpace: the database, your uploads and the app log. Set the STUDYSPACE_DATA_DIR environment variable to keep them somewhere else, such as a synced drive.',
  },
  {
    question: 'Does Study Space use AI to summarize or quiz me?',
    answer:
      'No, and that is the point. Study Space was built as a place to read the material yourself, so it has no AI summaries, generated quizzes or chat. Your highlights and notes are the study aids.',
  },
  {
    question: 'Which files can I import?',
    answer:
      'PDF. Each document is converted once, either reflowed so the text rewraps to your window, or in its original layout when the page design matters.',
  },
  {
    question: 'Can I write math in my notes?',
    answer:
      'Yes. Type LaTeX for inline and display equations, alongside tables, two column layouts, code blocks and quotes.',
  },
  {
    question: 'What happens to my data when I update?',
    answer:
      'The installer upgrades the app in place and leaves your data folder untouched. Any database changes are applied automatically the next time Study Space starts.',
  },
  {
    question: 'Does it work on macOS or Linux?',
    answer:
      'The installer is Windows only for now. The source code on GitHub can be run on other systems through the regular development setup.',
  },
  {
    question: 'Why a bust of Napoleon?',
    answer:
      'He read relentlessly, even on campaign, and believed imagination rules the world. Every palace needs a guardian, and he seemed the right one to keep watch over your desk.',
  },
];
