import { RESEARCH_TOOLS } from './research-tools'

export type ToolKind = 'read' | 'write'

export interface ToolDefinition {
	name: string
	kind: ToolKind
	description: string
	parameters: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
}

export const EDITOR_TOOLS: readonly ToolDefinition[] = [
	{
		name: 'get_outline',
		kind: 'read',
		description:
			'List every heading in the document with its level and index, followed by a summary of the block kinds it actually holds - tables, code blocks, rendered design blocks, images. Use this FIRST to orient yourself: a document with no headings is not necessarily empty, and the block summary tells you what it really is without reading it. It also flags HTML that is sitting in the document unrendered, which convert_to_html_block fixes in one step.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'read_section',
		kind: 'read',
		description:
			'Read the text under one heading, up to the next heading of the same or higher level. Prefer this over asking for the whole document.',
		parameters: {
			type: 'object',
			properties: {
				heading_index: {
					type: 'number',
					description: 'Index of the heading as returned by get_outline.',
				},
			},
			required: ['heading_index'],
		},
	},
	{
		name: 'find_text',
		kind: 'read',
		description:
			'Find occurrences of a phrase in the document. Returns a short snippet around each hit so you can quote it back exactly.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to look for.' },
			},
			required: ['query'],
		},
	},
	{
		name: 'get_document_stats',
		kind: 'read',
		description:
			'Get document statistics: word, character and page counts, heading counts per level, and counts of tables, images and formulas.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'get_selection',
		kind: 'read',
		description: 'Get the text the user has currently selected in the editor, with its position.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'get_page_setup',
		kind: 'read',
		description:
			'Get the page layout in effect: paper size, orientation, margins, page color and pageless mode.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'get_template_rules',
		kind: 'read',
		description:
			'Get the format rules of the template this document was created from: citation style, heading scheme, required sections and AI rules. Returns null when the document has no template. Use this when asked to check format compliance.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'list_tabs',
		kind: 'read',
		description: 'List the tabs of the active document with their ids and titles.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'read_tab',
		kind: 'read',
		description:
			'Read the text of another tab of the active document, e.g. to build a summary across chapters. Call list_tabs first to get the ids.',
		parameters: {
			type: 'object',
			properties: {
				tab_id: { type: 'string', description: 'Tab id as returned by list_tabs.' },
			},
			required: ['tab_id'],
		},
	},
	{
		name: 'get_comments',
		kind: 'read',
		description: 'List unresolved comments on the active tab, so they can be followed up.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'plan',
		kind: 'read',
		description:
			'Write down a step-by-step plan before a multi-step task. The plan is shown to the user in the progress timeline and its steps get checked off as you complete them.',
		parameters: {
			type: 'object',
			properties: {
				steps: {
					type: 'array',
					items: { type: 'string' },
					description: 'The planned steps, in order.',
				},
			},
			required: ['steps'],
		},
	},
	{
		name: 'think',
		kind: 'read',
		description:
			'Reason briefly without side effects. The thought is summarized in the progress timeline; it is never inserted into the document.',
		parameters: {
			type: 'object',
			properties: {
				thought: { type: 'string', description: 'The reasoning, briefly.' },
			},
			required: ['thought'],
		},
	},

	{
		name: 'insert_content',
		kind: 'write',
		description:
			'Insert new content into the document, written as Markdown: # headings, | … | tables, - lists. They become real editor nodes. Mathematics goes in $…$; everything else must be Markdown, never LaTeX markup like \\section or \\begin{tabular}.',
		parameters: {
			type: 'object',
			properties: {
				markdown: {
					type: 'string',
					description: 'The content as Markdown.',
				},
				position: {
					type: 'string',
					enum: ['cursor', 'end'],
					description: 'Where it goes. Defaults to the cursor.',
				},
			},
			required: ['markdown'],
		},
	},
	{
		name: 'replace_text',
		kind: 'write',
		description:
			'Replace an exact passage with new text. The find value must match the document character for character - use find_text or read_section first to copy it exactly.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact text to replace.' },
				replace: { type: 'string', description: 'Replacement, as Markdown.' },
			},
			required: ['find', 'replace'],
		},
	},
	{
		name: 'insert_math',
		kind: 'write',
		description:
			'Insert one mathematical formula. Pass only the LaTeX of the formula itself, without $ signs and without any document markup. For headings, tables or lists use insert_content with Markdown instead.',
		parameters: {
			type: 'object',
			properties: {
				latex: { type: 'string', description: 'LaTeX source, e.g. \\frac{a}{b}.' },
				display: {
					type: 'boolean',
					description: 'True for a block equation on its own line; false for inline.',
				},
			},
			required: ['latex'],
		},
	},
	{
		name: 'insert_page_break',
		kind: 'write',
		description: 'Start a new page at the cursor.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'add_comment',
		kind: 'write',
		description:
			'Leave a comment on a passage instead of editing it. Use this when the writer should decide, not you.',
		parameters: {
			type: 'object',
			properties: {
				quote: { type: 'string', description: 'Exact passage to attach the comment to.' },
				body: { type: 'string', description: 'The comment itself.' },
			},
			required: ['quote', 'body'],
		},
	},
	{
		name: 'run_module',
		kind: 'write',
		description:
			'Run one of the analysis modules and open its panel. Costs quota, so ask only when the user wants a full check.',
		parameters: {
			type: 'object',
			properties: {
				module: {
					type: 'string',
					enum: ['proofreader', 'ai_detector', 'ai_rewriter', 'humanizer', 'plagiarism'],
				},
			},
			required: ['module'],
		},
	},
	{
		name: 'set_page_setup',
		kind: 'write',
		description:
			'Change the page layout: paper size, orientation, margins, page color, pageless mode. Scope "document" applies to every tab; "tab" only the active one; "from_here" and "this_page" change only part of the document by inserting section breaks - use those for a landscape appendix or a single wide table.',
		parameters: {
			type: 'object',
			properties: {
				size: {
					type: 'string',
					enum: [
						'letter',
						'tabloid',
						'legal',
						'statement',
						'executive',
						'folio',
						'a3',
						'a4',
						'a5',
						'b4',
						'b5',
					],
				},
				orientation: { type: 'string', enum: ['portrait', 'landscape'] },
				margins_cm: {
					type: 'object',
					properties: {
						top: { type: 'number' },
						bottom: { type: 'number' },
						left: { type: 'number' },
						right: { type: 'number' },
					},
					description: 'Margins in centimeters; only the sides given are changed.',
				},
				page_color: { type: 'string', description: 'Hex color like #fdf6e3, or empty to follow the theme.' },
				pageless: { type: 'boolean' },
				scope: {
					type: 'string',
					enum: ['document', 'tab', 'from_here', 'this_page'],
					description:
						'Defaults to document. "from_here" applies from the cursor to the end; "this_page" only to the page the cursor is on, restoring the previous layout afterwards.',
				},
			},
		},
	},
	{
		name: 'insert_toc',
		kind: 'write',
		description:
			'Insert a table-of-contents block. This is the ONLY correct way to produce a table of contents, a list of figures or a list of tables: the block builds its own entries, dot leaders and page numbers from the document and keeps them in step as the document grows. NEVER type a table of contents as ordinary paragraphs with dots and numbers - those are plain text, the page numbers are guesses that go stale immediately, and justified academic body text stretches the dots until the numbers scatter into the middle of the line. list_kind "isi" lists headings; "gambar"/"tabel" list figure/table captions (heading levels 7-9). Levels, leader and indent follow the writer\'s settings unless given.',
		parameters: {
			type: 'object',
			properties: {
				list_kind: { type: 'string', enum: ['isi', 'gambar', 'tabel'] },
				style: { type: 'string', enum: ['plain', 'dotted', 'link'] },
				show_page_numbers: { type: 'boolean' },
				tab_leader: { type: 'string', enum: ['none', 'dots', 'dashes', 'line'] },
				min_level: { type: 'number', description: 'Highest heading level included, 1-9.' },
				max_level: { type: 'number', description: 'Deepest heading level included, 1-9.' },
				indent_cm: { type: 'number', description: 'Indent per level, in centimeters.' },
			},
		},
	},
	{
		name: 'set_toc_options',
		kind: 'write',
		description:
			'Change the settings of an existing table-of-contents block. Only the given fields are changed.',
		parameters: {
			type: 'object',
			properties: {
				list_kind: {
					type: 'string',
					enum: ['isi', 'gambar', 'tabel'],
					description: 'Only change blocks of this kind; omit to match any.',
				},
				index: { type: 'number', description: 'Which matching block, 0-based. Defaults to the first.' },
				style: { type: 'string', enum: ['plain', 'dotted', 'link'] },
				show_page_numbers: { type: 'boolean' },
				tab_leader: { type: 'string', enum: ['none', 'dots', 'dashes', 'line'] },
				min_level: { type: 'number' },
				max_level: { type: 'number' },
				indent_cm: { type: 'number' },
			},
		},
	},
	{
		name: 'insert_mermaid',
		kind: 'write',
		description:
			'Insert a Mermaid diagram block (flowchart, sequence, etc). Pass only the Mermaid source; it renders as a real diagram in the editor.',
		parameters: {
			type: 'object',
			properties: {
				source: { type: 'string', description: 'Mermaid source, e.g. "graph TD; A-->B".' },
			},
			required: ['source'],
		},
	},
	{
		name: 'apply_template_format',
		kind: 'write',
		description:
			'Apply a built-in document format to the whole document at once: paper size, margins, body font and size, line spacing, heading styles, and which heading levels start a new page. Use this FIRST when the writer asks for a document of a known kind - an Indonesian skripsi/tesis/disertasi, a business proposal or report, a conference paper, a flyer - and the document does not already follow that format. It is far more reliable than guessing margins and font sizes yourself with set_page_setup and set_font, because the numbers come from the template catalog. It answers with the writing rules for that format - citation style, heading scheme, and the format rules themselves - so you do not need to call get_template_rules afterwards. Applies to the whole document, not a selection.',
		parameters: {
			type: 'object',
			properties: {
				template: {
					type: 'string',
					description:
						'Template slug from the catalog, e.g. "skripsi-s1", "tesis-s2", "disertasi-s3", "proposal-penelitian", "laporan-kerja-praktik", "makalah-kuliah", "artikel-jurnal-nasional", "ieee-conference", "apa7-student", "proposal-proyek", "laporan-bulanan", "sop", "flyer-a4", "poster-a3".',
				},
			},
			required: ['template'],
		},
	},
	{
		name: 'insert_html_block',
		kind: 'write',
		description:
			'Insert a self-contained HTML design block - use it for flyers, pamphlets, posters, banners and other colourful print pieces whose layout cannot be expressed as paragraphs and headings (gradients, absolute positioning, overlapping elements). Do NOT use it for ordinary prose: the block is flattened to an image on DOCX export, so text inside it is not searchable or editable in Word. The HTML is rendered in a locked-down frame: your scripts never run and NOTHING loads from a URL - no icon library, no CDN font, no remote image - and all CSS must be inline or in a <style> tag. Draw icons, logos, badges, dividers and decorative shapes as inline <svg> elements: markup is not a network request, so they render on screen, stay vector in the printed PDF, and survive the DOCX flattening. Write the path data yourself instead of reaching for an icon set, and do not settle for emoji standing in for icons. Prefer inline <svg> over <img src="data:image/svg+xml,...">, which shows on screen but is unreliable in the DOCX export path. Raster images must still be data: URIs, and fonts must be data: URIs or system fonts. Design these pieces ambitiously - real typographic hierarchy, layered shapes, gradients and custom SVG iconography all work here. Pass only the markup that belongs inside <body>. Call get_page_setup first to learn the exact pixel canvas you are designing into.',
		parameters: {
			type: 'object',
			properties: {
				html: {
					type: 'string',
					description: 'HTML fragment for the body: markup plus inline <style>. No scripts, no remote URLs.',
				},
				fit: {
					type: 'string',
					enum: ['page', 'embed'],
					description:
						'"page" for a design that occupies one whole sheet edge to edge - a flyer, poster or one-pager. It is placed alone on its own page and bleeds past the margins. The frame you are given is ALREADY exactly the sheet, in the document\'s current size and orientation - both are stated in the editor context you receive, so never hardcode pixel dimensions and never assume landscape. Give the root element width:100%; height:100% and lay everything out inside it; a fixed height leaves the design hanging in the top part of the paper, and anything taller than the sheet is CUT OFF at the page edge, never scaled down. "embed" (default) is a small piece that flows inline with the surrounding text and uses the "height" argument.',
				},
				height: {
					type: 'number',
					description:
						'Block height in pixels at 96 dpi. Only used when fit is "embed"; ignored for "page". Defaults to 320, and is capped at the height of one page.',
				},
			},
			required: ['html'],
		},
	},
	{
		name: 'convert_to_html_block',
		kind: 'write',
		description:
			'Turn HTML that is already sitting in the document as ordinary text or as a code block into a real rendered design block. Use this whenever the writer asks to render, preview or "make a flyer out of" markup that is already there - NEVER read the markup and re-send it through insert_html_block, which costs a full rewrite of a design you already have. It takes no HTML: it finds the markup in the document and converts it in place. Answers with what it converted, or tells you no HTML-looking block was found.',
		parameters: {
			type: 'object',
			properties: {
				fit: {
					type: 'string',
					enum: ['page', 'embed'],
					description:
						'"page" (default) for a whole-sheet design - flyer, poster, one-pager. "embed" for a small piece that flows with the text.',
				},
				index: {
					type: 'number',
					description:
						'Which candidate to convert when the document holds more than one, 0-based, longest first. Defaults to the first.',
				},
			},
		},
	},
	{
		name: 'insert_table',
		kind: 'write',
		description: 'Insert a table of a given size, with or without a header row.',
		parameters: {
			type: 'object',
			properties: {
				rows: { type: 'number' },
				cols: { type: 'number' },
				header_row: { type: 'boolean', description: 'Defaults to true.' },
			},
			required: ['rows', 'cols'],
		},
	},
	{
		name: 'apply_paragraph_style',
		kind: 'write',
		description:
			'Turn the paragraph(s) covering an exact passage into a paragraph or a heading of level 1-9. Use find_text first to quote the passage exactly.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact text whose paragraph(s) get restyled.' },
				style: { type: 'string', enum: ['paragraph', 'heading'] },
				level: { type: 'number', description: 'Heading level 1-9; required for heading.' },
			},
			required: ['find', 'style'],
		},
	},
	{
		name: 'format_text',
		kind: 'write',
		description:
			'Apply character formatting to the first exact occurrence of a passage: bold, italic, underline, strikethrough, highlight or text color.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact text to format.' },
				bold: { type: 'boolean' },
				italic: { type: 'boolean' },
				underline: { type: 'boolean' },
				strike: { type: 'boolean' },
				highlight: { type: 'string', description: 'Highlight color, hex like #fff3a3.' },
				color: { type: 'string', description: 'Text color, hex like #c2410c.' },
			},
			required: ['find'],
		},
	},
	{
		name: 'set_alignment',
		kind: 'write',
		description:
			'Align paragraphs and headings: left, center, right or justify. Give "find" to align only the paragraphs covering that exact passage; omit it to align the whole document.',
		parameters: {
			type: 'object',
			properties: {
				align: { type: 'string', enum: ['left', 'center', 'right', 'justify'] },
				find: {
					type: 'string',
					description: 'Exact passage whose paragraphs get aligned. Omit for the whole document.',
				},
			},
			required: ['align'],
		},
	},
	{
		name: 'set_indent',
		kind: 'write',
		description:
			'Set paragraph indents in centimeters - the same values the ruler markers show. first_line_cm is relative to the left indent: positive indents the first line, negative gives a hanging indent. Only the values given are changed; omit "find" for the whole document.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact passage. Omit for the whole document.' },
				left_cm: { type: 'number' },
				right_cm: { type: 'number' },
				first_line_cm: { type: 'number', description: 'Negative for a hanging indent.' },
			},
		},
	},
	{
		name: 'set_spacing',
		kind: 'write',
		description:
			'Set line spacing and the space around paragraphs. line_height is a multiplier such as 1.5 or 2; space_before_pt and space_after_pt are in points. Only the values given are changed; omit "find" for the whole document.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact passage. Omit for the whole document.' },
				line_height: { type: 'number', description: 'Multiplier, e.g. 1, 1.15, 1.5 or 2.' },
				space_before_pt: { type: 'number' },
				space_after_pt: { type: 'number' },
			},
		},
	},
	{
		name: 'set_font',
		kind: 'write',
		description:
			'Set the typeface and/or size of a passage. size_pt is in points. Omit "find" to restyle the whole document.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact passage. Omit for the whole document.' },
				family: { type: 'string', description: 'Font family name, e.g. "Times New Roman".' },
				size_pt: { type: 'number' },
			},
		},
	},
	{
		name: 'toggle_list',
		kind: 'write',
		description:
			'Turn the paragraphs covering an exact passage into a bulleted or numbered list, or back into plain paragraphs with kind "none".',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact passage whose paragraphs become the list.' },
				kind: { type: 'string', enum: ['bullet', 'ordered', 'none'] },
			},
			required: ['find', 'kind'],
		},
	},
	{
		name: 'set_columns',
		kind: 'write',
		description:
			'Lay text out in newspaper columns. count 1 removes the column layout. By default it columns one passage ("find") or the whole document; scope "from_here" or "this_page" instead columns a section of the document, which is how a journal-style page is normally built.',
		parameters: {
			type: 'object',
			properties: {
				count: { type: 'number', description: '1 to remove columns, otherwise 2 or 3.' },
				find: { type: 'string', description: 'Exact passage. Omit for the whole document.' },
				scope: {
					type: 'string',
					enum: ['passage', 'from_here', 'this_page'],
					description:
						'Defaults to passage (uses "find", or the whole document when omitted). The others insert section breaks instead.',
				},
				gap_cm: { type: 'number', description: 'Space between columns in centimeters.' },
			},
			required: ['count'],
		},
	},
	{
		name: 'insert_section_break',
		kind: 'write',
		description:
			'Start a new section at the cursor: the content after it begins on a fresh page and may use a different paper size, orientation, margins or column count. Everything not given is inherited from the section before it. Use this to begin a landscape appendix or a two-column part; use set_page_setup or set_columns to change a section that already exists.',
		parameters: {
			type: 'object',
			properties: {
				size: {
					type: 'string',
					enum: [
						'letter',
						'tabloid',
						'legal',
						'statement',
						'executive',
						'folio',
						'a3',
						'a4',
						'a5',
						'b4',
						'b5',
					],
				},
				orientation: { type: 'string', enum: ['portrait', 'landscape'] },
				margins_cm: {
					type: 'object',
					properties: {
						top: { type: 'number' },
						bottom: { type: 'number' },
						left: { type: 'number' },
						right: { type: 'number' },
					},
					description: 'Margins in centimeters; only the sides given are changed.',
				},
				columns: { type: 'number', description: 'Column count for the new section; 1 for a single column.' },
				gap_cm: { type: 'number', description: 'Space between columns in centimeters.' },
			},
		},
	},
	{
		name: 'insert_footnote',
		kind: 'write',
		description:
			'Attach a footnote to an exact passage: a superscript reference is placed right after it and the note text is appended as a footnote block at the end of the document.',
		parameters: {
			type: 'object',
			properties: {
				quote: { type: 'string', description: 'Exact passage the reference follows.' },
				body: { type: 'string', description: 'The note text.' },
			},
			required: ['quote', 'body'],
		},
	},
	{
		name: 'restructure_section',
		kind: 'write',
		description:
			'Restructure one section (a heading plus everything under it): promote/demote its heading level, move it before another section, or delete it. Use get_outline first for the indexes.',
		parameters: {
			type: 'object',
			properties: {
				heading_index: { type: 'number', description: 'Index from get_outline.' },
				action: { type: 'string', enum: ['promote', 'demote', 'move_before', 'delete'] },
				target_index: { type: 'number', description: 'For move_before: the section to insert before.' },
			},
			required: ['heading_index', 'action'],
		},
	},
	{
		name: 'insert_image',
		kind: 'write',
		description: 'Insert an image from a public http(s) URL. Private or loopback addresses are rejected.',
		parameters: {
			type: 'object',
			properties: {
				src: { type: 'string', description: 'Public image URL.' },
				alt: { type: 'string' },
			},
			required: ['src'],
		},
	},
	{
		name: 'create_tab',
		kind: 'write',
		description:
			'Create a new tab in the active document, optionally with initial content as Markdown - e.g. an appendix.',
		parameters: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				markdown: { type: 'string', description: 'Initial content as Markdown.' },
			},
		},
	},
]

/** Semua alat yang bisa dipanggil model, apa pun modenya. */
export const ALL_TOOLS: readonly ToolDefinition[] = [...EDITOR_TOOLS, ...RESEARCH_TOOLS]

const BY_NAME = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]))

export function findTool(name: string): ToolDefinition | undefined {
	return BY_NAME.get(name)
}

export function isReadTool(name: string): boolean {
	return BY_NAME.get(name)?.kind === 'read'
}

export interface ToolCall {
	id: string
	name: string
	arguments: Record<string, unknown>
}

export interface ToolResult {
	id: string
	name: string
	content: string
}

export interface ToolScope {
	/** Alat riset web hanya dikirim ke model saat mode riset menyala. */
	research?: boolean
}

function toolsInScope(scope: ToolScope | undefined): readonly ToolDefinition[] {
	return scope?.research ? ALL_TOOLS : EDITOR_TOOLS
}

export function toProviderTools(scope?: ToolScope): unknown[] {
	return toolsInScope(scope).map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}))
}

export function fallbackToolPrompt(scope?: ToolScope): string {
	const list = toolsInScope(scope)
		.map((tool) => {
			const params = Object.keys(tool.parameters.properties).join(', ') || '(none)'
			return `- ${tool.name}(${params}) - ${tool.description}`
		})
		.join('\n')

	return [
		'You can operate the editor by emitting tool calls. To call a tool, write a',
		'fenced block tagged `writerhub` containing one JSON object:',
		'',
		'```writerhub',
		'{"tool": "insert_content", "arguments": {"markdown": "| A | B |\\n|---|---|\\n| 1 | 2 |"}}',
		'```',
		'',
		'Emit nothing else inside that block. Available tools:',
		list,
	].join('\n')
}

export const FALLBACK_TOOL_FENCE = /```writerhub\s*\n([\s\S]*?)```/g
