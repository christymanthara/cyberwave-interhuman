from langchain.agents import create_agent
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient 



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
                    "headers": {"Authorization": "Bearer CYBERWAVE_API_KEY"},
                }
            }
        )

    tools = await client.get_tools()


    agent = create_agent(
        model="openrouter:google/gemma-4-31b-it:free",
        tools=tools,
        system_prompt="You are a helpful assistant",
    )

    result = agent.invoke(
        {"messages": [{"role": "user", "content": "What's the weather in San Francisco?"}]}
    )
    print(result["messages"][-1].content_blocks)