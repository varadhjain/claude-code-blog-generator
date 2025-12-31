/**
 * Test 3: HTML Generation (no API calls)
 * Verifies we can generate HTML output with mock data
 */

import { generateAnnotatedHTML, type SessionMessage } from './src/annotated-viewer/generator';
import { readFile } from 'fs/promises';

async function testHTMLGeneration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 4: HTML Generation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Create mock messages with annotations
    const mockMessages: SessionMessage[] = [
      {
        role: 'user',
        content: 'Can you help me build a blog post generator?',
        timestamp: new Date('2025-01-01T10:00:00Z'),
        annotation: {
          taskType: 'NEW_TASK',
          importance: 'high' as const,
          summary: 'User wants to build a blog post generator',
          color: 'green' as const
        }
      },
      {
        role: 'assistant',
        content: 'I can help you build a blog post generator. Let me start by understanding your requirements.',
        timestamp: new Date('2025-01-01T10:00:05Z')
      },
      {
        role: 'user',
        content: 'I want it to convert Claude Code sessions into blog posts',
        timestamp: new Date('2025-01-01T10:01:00Z'),
        annotation: {
          taskType: 'CLARIFICATION',
          importance: 'medium' as const,
          summary: 'Clarifying the use case - converting Claude Code sessions',
          color: 'yellow' as const
        }
      },
      {
        role: 'assistant',
        content: 'That sounds like a great project. Let me help you design the architecture.',
        timestamp: new Date('2025-01-01T10:01:10Z')
      },
      {
        role: 'user',
        content: 'Actually, let\'s also add support for gist uploads',
        timestamp: new Date('2025-01-01T10:05:00Z'),
        annotation: {
          taskType: 'PIVOT',
          importance: 'high' as const,
          summary: 'Pivoting to add gist upload feature',
          color: 'red' as const
        }
      },
      {
        role: 'assistant',
        content: 'Good idea! I\'ll add GitHub Gist integration using the gh CLI.',
        timestamp: new Date('2025-01-01T10:05:15Z')
      }
    ];

    console.log('Creating mock session with 6 messages...');
    console.log(`  - 3 user messages (with annotations)`);
    console.log(`  - 3 assistant messages`);
    console.log(`  - Annotations: green (NEW_TASK), yellow (CLARIFICATION), red (PIVOT)\n`);

    // Mock annotations structure
    const mockAnnotations = {
      phases: [
        {
          name: 'Planning',
          description: 'Initial project planning and requirements gathering',
          startIndex: 0,
          endIndex: 2
        },
        {
          name: 'Implementation',
          description: 'Building core features and adding gist upload',
          startIndex: 2,
          endIndex: 6
        }
      ],
      taskBoundaries: [0, 2, 4],
      keyMoments: [
        {
          messageIndex: 0,
          annotation: 'User wants to build a blog post generator',
          timestamp: new Date('2025-01-01T10:00:00Z'),
          color: 'green' as const
        },
        {
          messageIndex: 2,
          annotation: 'Clarifying the use case - converting Claude Code sessions',
          timestamp: new Date('2025-01-01T10:01:00Z'),
          color: 'yellow' as const
        },
        {
          messageIndex: 4,
          annotation: 'Pivoting to add gist upload feature',
          timestamp: new Date('2025-01-01T10:05:00Z'),
          color: 'red' as const
        }
      ]
    };

    console.log('Generating HTML output...\n');

    const htmlOutput = await generateAnnotatedHTML(
      mockMessages,
      mockAnnotations,
      {
        sessionTitle: 'Test Session - Blog Post Generator',
        sessionId: 'test-session',
        messagesPerPage: 50
      }
    );

    console.log('✓ HTML generation successful');
    console.log(`  Pages generated: ${htmlOutput.pages.length}`);
    console.log(`  Summary page: ${htmlOutput.summary ? 'Yes' : 'No'}`);
    console.log(`  Key moments: ${mockAnnotations.keyMoments.length}`);

    // Validate output structure
    if (htmlOutput.pages.length === 0) {
      throw new Error('No pages generated');
    }

    if (!htmlOutput.summary) {
      throw new Error('No summary page generated');
    }

    // Check that pages have required content
    const firstPage = htmlOutput.pages[0];
    if (!firstPage.html.includes('keyboard-shortcuts')) {
      console.warn('  ⚠️  Warning: Keyboard shortcuts banner not found');
    } else {
      console.log('  ✓ Keyboard shortcuts banner present');
    }

    if (!firstPage.html.includes('focus-toggle')) {
      console.warn('  ⚠️  Warning: Focus mode toggle not found');
    } else {
      console.log('  ✓ Focus mode toggle present');
    }

    // Check summary page
    if (!htmlOutput.summary.html.includes('timeline')) {
      console.warn('  ⚠️  Warning: Timeline not found in summary');
    } else {
      console.log('  ✓ Timeline present in summary');
    }

    console.log('\n✅ PASS: HTML generation works correctly\n');
    return true;
  } catch (error: any) {
    console.error('\n❌ FAIL: HTML generation failed');
    console.error(`  Error: ${error.message}`);
    if (error.stack) {
      console.error(`\n  Stack trace (first 5 lines):`);
      const stackLines = error.stack.split('\n').slice(0, 5);
      stackLines.forEach((line: string) => console.error(`  ${line}`));
    }
    console.error('');
    return false;
  }
}

testHTMLGeneration().then(success => {
  process.exit(success ? 0 : 1);
});
