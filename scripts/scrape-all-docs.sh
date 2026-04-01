#!/bin/bash
# Scrape all Gemini API docs pages and save as organized .txt files

BASE_URL="https://ai.google.dev"
OUT_DIR="/Users/jones/Documents/Code/All-Model-Chat/Gemini-API-Docs"

scrape_page() {
  local cat="$1"
  local name="$2"
  local href="$3"
  local url="${BASE_URL}${href}?hl=en"
  local dir="${OUT_DIR}/${cat}"
  local filepath="${dir}/${name}.txt"
  
  # Skip if already exists and non-empty
  if [ -s "$filepath" ]; then
    echo "⏭️  Skip: ${cat}/${name}"
    return 0
  fi
  
  echo -n "⏳ ${cat}/${name} ... "
  
  # Fetch the page
  html=$(curl -s -L --max-time 30 "$url")
  
  if [ -z "$html" ]; then
    echo "❌ Empty response"
    return 1
  fi
  
  # Extract article content, strip HTML tags, clean up
  content=$(echo "$html" | python3 -c "
import sys
from html.parser import HTMLParser

class ArticleExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_article = False
        self.depth = 0
        self.skip_tags = {'script', 'style', 'nav', 'header', 'footer'}
        self.in_skip = 0
        self.text_parts = []
        
    def handle_starttag(self, tag, attrs):
        if tag == 'article':
            self.in_article = True
            self.depth = 1
        elif self.in_article:
            self.depth += 1
            if tag in self.skip_tags:
                self.in_skip += 1
                
    def handle_endtag(self, tag):
        if self.in_article:
            self.depth -= 1
            if tag in self.skip_tags and self.in_skip > 0:
                self.in_skip -= 1
            if self.depth <= 0:
                self.in_article = False
                
    def handle_data(self, data):
        if self.in_article and self.in_skip == 0:
            text = data.strip()
            if text:
                self.text_parts.append(text)
    
    def get_text(self):
        return '\n'.join(self.text_parts)

extractor = ArticleExtractor()
extractor.feed(sys.stdin.read())
print(extractor.get_text())
" 2>/dev/null)
  
  if [ -z "$content" ] || [ ${#content} -lt 50 ]; then
    echo "❌ No content extracted"
    return 1
  fi
  
  # Add header
  {
    echo "# Title: ${name//_/ }"
    echo "# Category: ${cat}"
    echo "# Source: ${url}"
    echo "# Scraped: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "# ============================================================"
    echo ""
    echo "$content"
  } > "$filepath"
  
  local size=$(wc -c < "$filepath" | tr -d ' ')
  echo "✅ (${size} bytes)"
  return 0
}

mkdir -p "${OUT_DIR}"

# 01-Get-Started
mkdir -p "${OUT_DIR}/01-Get-Started"
scrape_page "01-Get-Started" "Overview" "/gemini-api/docs"
scrape_page "01-Get-Started" "Quickstart" "/gemini-api/docs/quickstart"
scrape_page "01-Get-Started" "API_keys" "/gemini-api/docs/api-key"
scrape_page "01-Get-Started" "Libraries" "/gemini-api/docs/libraries"
scrape_page "01-Get-Started" "Pricing" "/gemini-api/docs/pricing"
scrape_page "01-Get-Started" "Batch_API" "/gemini-api/docs/batch-api"
scrape_page "01-Get-Started" "Interactions_API" "/gemini-api/docs/interactions"
scrape_page "01-Get-Started" "Coding_agent_setup" "/gemini-api/docs/coding-agents"

# 02-Models
mkdir -p "${OUT_DIR}/02-Models"
scrape_page "02-Models" "All_models" "/gemini-api/docs/models"
scrape_page "02-Models" "Gemini_3" "/gemini-api/docs/gemini-3"
scrape_page "02-Models" "Nano_Banana" "/gemini-api/docs/image-generation"
scrape_page "02-Models" "Veo" "/gemini-api/docs/video"
scrape_page "02-Models" "Lyria_3" "/gemini-api/docs/music-generation"
scrape_page "02-Models" "Lyria_RealTime" "/gemini-api/docs/realtime-music-generation"
scrape_page "02-Models" "Imagen" "/gemini-api/docs/imagen"
scrape_page "02-Models" "Text-to-speech" "/gemini-api/docs/speech-generation"
scrape_page "02-Models" "Embeddings" "/gemini-api/docs/embeddings"
scrape_page "02-Models" "Robotics" "/gemini-api/docs/robotics-overview"

# 03-Core-Capabilities
mkdir -p "${OUT_DIR}/03-Core-Capabilities"
scrape_page "03-Core-Capabilities" "Text" "/gemini-api/docs/text-generation"
scrape_page "03-Core-Capabilities" "Image_understanding" "/gemini-api/docs/image-understanding"
scrape_page "03-Core-Capabilities" "Video_understanding" "/gemini-api/docs/video-understanding"
scrape_page "03-Core-Capabilities" "Documents" "/gemini-api/docs/document-processing"
scrape_page "03-Core-Capabilities" "Audio_understanding" "/gemini-api/docs/audio"
scrape_page "03-Core-Capabilities" "Thinking" "/gemini-api/docs/thinking"
scrape_page "03-Core-Capabilities" "Thought_signatures" "/gemini-api/docs/thought-signatures"
scrape_page "03-Core-Capabilities" "Structured_outputs" "/gemini-api/docs/structured-output"
scrape_page "03-Core-Capabilities" "Function_calling" "/gemini-api/docs/function-calling"
scrape_page "03-Core-Capabilities" "Long_context" "/gemini-api/docs/long-context"

# 04-Agents
mkdir -p "${OUT_DIR}/04-Agents"
scrape_page "04-Agents" "Agents_Overview" "/gemini-api/docs/agents"
scrape_page "04-Agents" "Deep_Research_Agent" "/gemini-api/docs/deep-research"

# 05-Tools
mkdir -p "${OUT_DIR}/05-Tools"
scrape_page "05-Tools" "Tools_Overview" "/gemini-api/docs/tools"
scrape_page "05-Tools" "Google_Search" "/gemini-api/docs/google-search"
scrape_page "05-Tools" "Google_Maps" "/gemini-api/docs/maps-grounding"
scrape_page "05-Tools" "Code_execution" "/gemini-api/docs/code-execution"
scrape_page "05-Tools" "URL_context" "/gemini-api/docs/url-context"
scrape_page "05-Tools" "Computer_Use" "/gemini-api/docs/computer-use"
scrape_page "05-Tools" "File_Search" "/gemini-api/docs/file-search"
scrape_page "05-Tools" "Combine_Tools" "/gemini-api/docs/tool-combination"

# 06-Live-API
mkdir -p "${OUT_DIR}/06-Live-API"
scrape_page "06-Live-API" "Live_API_Overview" "/gemini-api/docs/live-api"
scrape_page "06-Live-API" "Get_started_GenAI_SDK" "/gemini-api/docs/live-api/get-started-sdk"
scrape_page "06-Live-API" "Get_started_WebSockets" "/gemini-api/docs/live-api/get-started-websocket"
scrape_page "06-Live-API" "Capabilities" "/gemini-api/docs/live-api/capabilities"
scrape_page "06-Live-API" "Tool_use" "/gemini-api/docs/live-api/tools"
scrape_page "06-Live-API" "Session_management" "/gemini-api/docs/live-api/session-management"
scrape_page "06-Live-API" "Ephemeral_tokens" "/gemini-api/docs/live-api/ephemeral-tokens"
scrape_page "06-Live-API" "Best_practices" "/gemini-api/docs/live-api/best-practices"

# 07-Guides
mkdir -p "${OUT_DIR}/07-Guides"
scrape_page "07-Guides" "Input_methods" "/gemini-api/docs/file-input-methods"
scrape_page "07-Guides" "Files_API" "/gemini-api/docs/files"
scrape_page "07-Guides" "Context_caching" "/gemini-api/docs/caching"
scrape_page "07-Guides" "OpenAI_compatibility" "/gemini-api/docs/openai"
scrape_page "07-Guides" "Media_resolution" "/gemini-api/docs/media-resolution"
scrape_page "07-Guides" "Token_counting" "/gemini-api/docs/tokens"
scrape_page "07-Guides" "Prompt_engineering" "/gemini-api/docs/prompting-strategies"
scrape_page "07-Guides" "Get_started_with_logs" "/gemini-api/docs/logs-datasets"
scrape_page "07-Guides" "Data_logging_and_sharing" "/gemini-api/docs/logs-policy"
scrape_page "07-Guides" "Safety_settings" "/gemini-api/docs/safety-settings"
scrape_page "07-Guides" "Safety_guidance" "/gemini-api/docs/safety-guidance"

# 08-Frameworks
mkdir -p "${OUT_DIR}/08-Frameworks"
scrape_page "08-Frameworks" "LangChain_LangGraph" "/gemini-api/docs/langgraph-example"
scrape_page "08-Frameworks" "CrewAI" "/gemini-api/docs/crewai-example"
scrape_page "08-Frameworks" "LlamaIndex" "/gemini-api/docs/llama-index"
scrape_page "08-Frameworks" "Vercel_AI_SDK" "/gemini-api/docs/vercel-ai-sdk-example"
scrape_page "08-Frameworks" "Temporal" "/gemini-api/docs/temporal-example"

# 09-Resources
mkdir -p "${OUT_DIR}/09-Resources"
scrape_page "09-Resources" "Release_notes" "/gemini-api/docs/changelog"
scrape_page "09-Resources" "Deprecations" "/gemini-api/docs/deprecations"
scrape_page "09-Resources" "Rate_limits" "/gemini-api/docs/rate-limits"
scrape_page "09-Resources" "Billing_info" "/gemini-api/docs/billing"
scrape_page "09-Resources" "Migrate_to_Gen_AI_SDK" "/gemini-api/docs/migrate"
scrape_page "09-Resources" "API_troubleshooting" "/gemini-api/docs/troubleshooting"
scrape_page "09-Resources" "Partner_integrations" "/gemini-api/docs/partner-integration"

# 10-Google-AI-Studio
mkdir -p "${OUT_DIR}/10-Google-AI-Studio"
scrape_page "10-Google-AI-Studio" "AI_Studio_Quickstart" "/gemini-api/docs/ai-studio-quickstart"
scrape_page "10-Google-AI-Studio" "Vibe_code_Build_mode" "/gemini-api/docs/aistudio-build-mode"
scrape_page "10-Google-AI-Studio" "Full-Stack_Apps" "/gemini-api/docs/aistudio-fullstack"
scrape_page "10-Google-AI-Studio" "LearnLM" "/gemini-api/docs/learnlm"
scrape_page "10-Google-AI-Studio" "AI_Studio_Troubleshooting" "/gemini-api/docs/troubleshoot-ai-studio"
scrape_page "10-Google-AI-Studio" "Workspace_access" "/gemini-api/docs/workspace"

# 11-Google-Cloud-Platform
mkdir -p "${OUT_DIR}/11-Google-Cloud-Platform"
scrape_page "11-Google-Cloud-Platform" "VertexAI_Gemini_API" "/gemini-api/docs/migrate-to-cloud"
scrape_page "11-Google-Cloud-Platform" "OAuth_authentication" "/gemini-api/docs/oauth"

# 12-Policies
mkdir -p "${OUT_DIR}/12-Policies"
scrape_page "12-Policies" "Terms_of_service" "/gemini-api/terms"
scrape_page "12-Policies" "Available_regions" "/gemini-api/docs/available-regions"
scrape_page "12-Policies" "Abuse_monitoring" "/gemini-api/docs/usage-policies"
scrape_page "12-Policies" "Feedback_information" "/gemini-api/docs/feedback-policies"

echo ""
echo "========================================="
echo "Done! All docs saved to: ${OUT_DIR}"
echo "========================================="
echo ""
echo "Directory structure:"
find "${OUT_DIR}" -name "*.txt" | sort | head -100
echo ""
echo "Total files: $(find "${OUT_DIR}" -name '*.txt' | wc -l | tr -d ' ')"
echo "Total size: $(du -sh "${OUT_DIR}" | cut -f1)"
