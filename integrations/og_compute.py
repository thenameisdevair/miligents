"""
integrations/og_compute.py

OpenAI-compatible LLM client for MiliGents agents.
Works with both Cerebras (development) and 0G Compute (demo)
by reading environment variables — zero code change needed to switch.

Development:
  LLM_BASE_URL=https://api.cerebras.ai/v1
  LLM_API_KEY=your_cerebras_key
  LLM_MODEL=llama-3.3-70b

Demo (0G Compute):
  LLM_BASE_URL=https://<provider_url>/v1/proxy
  LLM_API_KEY=app-sk-<secret>
  LLM_MODEL=qwen-2.5-7b-instruct
"""

import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def get_client() -> OpenAI:
    """
    Get a configured OpenAI-compatible LLM client.

    Reads LLM_BASE_URL and LLM_API_KEY from environment.
    Works with Cerebras (dev) and 0G Compute (demo) identically.

    Returns:
        Configured OpenAI client instance.
    """
    base_url = os.getenv("LLM_BASE_URL")
    api_key = os.getenv("LLM_API_KEY")

    if not base_url or not api_key:
        raise EnvironmentError(
            "LLM_BASE_URL and LLM_API_KEY must be set in .env"
        )

    return OpenAI(base_url=base_url, api_key=api_key)


def chat(
    messages: list[dict],
    system_prompt: str | None = None
) -> str:
    """
    Send a chat request to the configured LLM.

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
                  Example: [{"role": "user", "content": "Hello"}]
        system_prompt: Optional system prompt prepended to messages.

    Returns:
        Response content as string.

    Raises:
        EnvironmentError: If LLM env vars are not set.
        Exception: If LLM API call fails.
    """
    client = get_client()
    model = os.getenv("LLM_MODEL", "llama-3.3-70b")

    full_messages = []
    if system_prompt:
        full_messages.append({
            "role": "system",
            "content": system_prompt
        })
    full_messages.extend(messages)

    response = client.chat.completions.create(
        model=model,
        messages=full_messages,
        max_tokens=2048,
        temperature=0.7
    )

    return response.choices[0].message.content


def chat_simple(prompt: str, system_prompt: str | None = None) -> str:
    """
    Convenience wrapper — send a single user message and get a response.

    Args:
        prompt: User message string.
        system_prompt: Optional system prompt.

    Returns:
        Response content as string.
    """
    return chat(
        messages=[{"role": "user", "content": prompt}],
        system_prompt=system_prompt
    )


def test_connection() -> bool:
    """
    Test LLM connection with a minimal request.

    Returns:
        True if connection works, False otherwise.
    """
    try:
        response = chat_simple("Say 'ok' and nothing else.")
        print(f"[LLM] Connection test response: {response}")
        return len(response) > 0
    except Exception as e:
        print(f"[LLM] Connection test failed: {e}")
        return False
