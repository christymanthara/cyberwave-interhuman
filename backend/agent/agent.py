from langchain.agents import create_agent
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from dotenv import load_dotenv
import os
from typing import AsyncGenerator

load_dotenv()


# ---------------------------------------------------------------------------
# Reusable factory – called by FastAPI at startup / per-request
# ---------------------------------------------------------------------------

def _build_mcp_config() -> dict:
    """Return the MCP server config dict, reading secrets from env."""
    return {
        "interhuman": {
            "transport": "http",
            "url": "https://interhumanai-realtime.mintlify.app/mcp",
        },
        "cyberwave": {
            "transport": "http",
            "url": "https://mcp.cyberwave.com/mcp",
            "headers": {"Authorization": f"Bearer {os.environ['CYBERWAVE_API_KEY']}"},
        },
    }


async def get_agent():
    """
    Initialise the MCP client and return a ready-to-use agent.
    Call this once at FastAPI startup and cache the result, or call
    per-request if you need a fresh MCP session each time.
    """
    client = MultiServerMCPClient(_build_mcp_config())
    tools = await client.get_tools()

    agent = create_agent(
        # model="openrouter:qwen/qwen3-coder:free",
        model="openrouter:cohere/north-mini-code:free",
        # model="ollama:qwen3:4b",
        tools=tools,
        system_prompt="You are a helpful assistant",
    )
    return agent


async def chat(user_message: str, history: list[dict] | None = None) -> str:
    """
    Send *user_message* to the agent and return the assistant reply as a string.
    Optionally pass prior *history* as a list of {role, content} dicts.

    This is the primary entry-point used by the FastAPI /v1/chat endpoint.
    """
    agent = await get_agent()
    messages = (history or []) + [{"role": "user", "content": user_message}]
    result = await agent.ainvoke({"messages": messages})
    last_message = result["messages"][-1]
    # Some models return content_blocks; fall back to .content
    if hasattr(last_message, "content_blocks") and last_message.content_blocks:
        return str(last_message.content_blocks)
    return last_message.content


async def stream_chat(
    user_message: str, history: list[dict] | None = None
) -> AsyncGenerator[str, None]:
    """
    Streaming variant – yields text chunks as the agent produces them.
    Use with the /v1/chat/stream endpoint (Server-Sent Events).
    """
    agent = await get_agent()
    messages = (history or []) + [{"role": "user", "content": user_message}]
    async for chunk in agent.astream({"messages": messages}):
        # astream yields dicts; extract the assistant delta text
        for msg in chunk.get("messages", []):
            if hasattr(msg, "content") and msg.content:
                yield msg.content


# ---------------------------------------------------------------------------
# Original standalone entry-point – unchanged
# ---------------------------------------------------------------------------

async def main():
    client = MultiServerMCPClient(
            {
                "interhuman": {
                    "transport": "http",  # Local subprocess communication
                    "url": "https://interhumanai-realtime.mintlify.app/mcp",
                },
                "cyberwave": {
                    "transport": "http",  # HTTP-based remote server
                    # Ensure you start your weather server on port 8000
                    "url": "https://mcp.cyberwave.com/mcp",
                    "headers": {"Authorization": f"Bearer {os.environ['CYBERWAVE_API_KEY']}"},
                }
            }
        )

    tools = await client.get_tools()
    # print ("Available tools:", tools)


    agent = create_agent(
        # model="openrouter:qwen/qwen3-coder:free",
        model="openrouter:cohere/north-mini-code:free",
        # model="ollama:qwen3:4b",
        tools=tools,
        system_prompt="You are a helpful assistant",
    )
    print("Invoking agent...")
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": "Can you tell me about emotions in interhuman"}]}
    )
    print(result["messages"][-1].content_blocks)
    print(result)

if __name__ == "__main__":
    asyncio.run(main())