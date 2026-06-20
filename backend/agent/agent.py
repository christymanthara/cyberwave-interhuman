from langchain.agents import create_agent
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient 
from dotenv import load_dotenv
import os
load_dotenv()


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
        model="ollama:qwen3:4b",
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