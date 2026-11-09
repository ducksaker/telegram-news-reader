#!/usr/bin/env python3
"""Test lõi dịch của serve.py: chunk UTF-8, parse Google/MyMemory, fallback, quota.

Chạy: python tests/translate_proxy.test.py
Không gọi mạng: mọi upstream đều được patch.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import serve  # noqa: E402


class SplitUtf8Test(unittest.TestCase):
    def test_ascii_chunks_respect_limit_and_lossless(self):
        text = "The quick brown fox jumps over the lazy dog. " * 40
        chunks = serve.split_utf8(text, 450)
        self.assertGreater(len(chunks), 1)
        self.assertTrue(all(len(c.encode("utf-8")) <= 450 for c in chunks))
        self.assertEqual("".join(chunks), text)

    def test_vietnamese_and_chinese_not_split_mid_character(self):
        text = ("Xin chào thế giới. " * 20) + ("你好，这是一次翻译测试。" * 20)
        chunks = serve.split_utf8(text, 450)
        self.assertTrue(all(len(c.encode("utf-8")) <= 450 for c in chunks))
        self.assertEqual("".join(chunks), text)
        for c in chunks:
            c.encode("utf-8").decode("utf-8")  # không ném lỗi

    def test_empty(self):
        self.assertEqual(serve.split_utf8("", 450), [])


class ParseGoogleTest(unittest.TestCase):
    def test_normal(self):
        payload = [[["Xin chào", "Hello", None, None, 1]], None, "en", None, None, None, 1.0]
        self.assertEqual(serve.parse_google(payload), {"t": "Xin chào", "lang": "en"})

    def test_vietnamese_source_is_empty_translation(self):
        payload = [[], None, "vi"]
        self.assertEqual(serve.parse_google(payload), {"t": "", "lang": "vi"})

    def test_html_captcha_is_bad_response(self):
        with self.assertRaisesRegex(ValueError, "google_bad_response"):
            serve.parse_google("<html>captcha</html>")


class ParseMymemoryTest(unittest.TestCase):
    def test_normal(self):
        payload = {
            "responseData": {"translatedText": "Xin chào", "detectedLanguage": "en"},
            "responseStatus": 200,
            "quotaFinished": False,
        }
        self.assertEqual(serve.parse_mymemory(payload), {"t": "Xin chào", "lang": "en"})

    def test_vietnamese_source(self):
        payload = {
            "responseData": {"translatedText": "PLEASE SELECT TWO DISTINCT LANGUAGES"},
            "responseStatus": "403",
            "responseDetails": "PLEASE SELECT TWO DISTINCT LANGUAGES",
        }
        self.assertEqual(serve.parse_mymemory(payload), {"t": "", "lang": "vi"})

    def test_quota_finished(self):
        with self.assertRaisesRegex(ValueError, "mymemory_quota"):
            serve.parse_mymemory({"quotaFinished": True, "responseData": {}})

    def test_query_too_long(self):
        payload = {
            "responseData": {"translatedText": "QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS"},
            "responseStatus": "403",
            "responseDetails": "QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS",
        }
        with self.assertRaisesRegex(ValueError, "mymemory_too_long"):
            serve.parse_mymemory(payload)


class TranslateTextTest(unittest.TestCase):
    def setUp(self):
        serve._translate_cache.clear()
        serve._my_budget["day"] = ""
        serve._my_budget["chars"] = 0

    def test_google_first(self):
        with patch.object(serve, "fetch_google", return_value={"t": "Xin chào", "lang": "en"}) as g, \
             patch.object(serve, "fetch_mymemory") as m:
            out = serve.translate_text("Hello")
        self.assertTrue(out["ok"])
        self.assertEqual(out["provider"], "google")
        self.assertEqual(out["t"], "Xin chào")
        m.assert_not_called()

    def test_google_429_falls_back_to_mymemory(self):
        with patch.object(serve, "fetch_google", side_effect=ValueError("google_429")), \
             patch.object(serve, "fetch_mymemory", return_value={"t": "Xin chào", "lang": "en"}):
            out = serve.translate_text("Hello")
        self.assertTrue(out["ok"])
        self.assertEqual(out["provider"], "mymemory")
        self.assertEqual(out["t"], "Xin chào")
        self.assertIn("google_429", out.get("errors", []))

    def test_both_fail_returns_error(self):
        with patch.object(serve, "fetch_google", side_effect=ValueError("google_429")), \
             patch.object(serve, "fetch_mymemory", side_effect=ValueError("mymemory_quota")):
            out = serve.translate_text("Hello")
        self.assertFalse(out["ok"])
        self.assertEqual(out["error"], "mymemory_quota")
        self.assertEqual(out.get("errors"), ["google_429", "mymemory_quota"])

    def test_cache_avoids_second_upstream_call(self):
        with patch.object(serve, "fetch_google", return_value={"t": "Xin chào", "lang": "en"}) as g:
            serve.translate_text("Hello")
            serve.translate_text("Hello")
        self.assertEqual(g.call_count, 1)


class FetchMymemoryTest(unittest.TestCase):
    def setUp(self):
        serve._my_budget["day"] = ""
        serve._my_budget["chars"] = 0

    def test_chunks_and_charges_budget(self):
        calls = []

        def fake_http(url, timeout):
            calls.append(url)
            return {
                "responseData": {"translatedText": "X", "detectedLanguage": "en"},
                "responseStatus": 200,
                "quotaFinished": False,
            }

        text = "a" * 1000
        with patch.object(serve, "_http_json", side_effect=fake_http):
            out = serve.fetch_mymemory(text)
        self.assertGreater(len(calls), 1)
        self.assertEqual(out["lang"], "en")
        self.assertEqual(out["t"].count("X"), len(serve.split_utf8(text, serve.MYMEMORY_MAX_BYTES)))
        self.assertGreater(serve._my_budget["chars"], 0)
        self.assertTrue(all(len(c.split("q=")[1].split("&")[0]) <= 500 for c in calls))

    def test_daily_budget_exhausted_before_calling_upstream(self):
        serve._my_budget["day"] = serve._today()
        serve._my_budget["chars"] = serve.MYMEMORY_DAILY_CHARS
        with patch.object(serve, "_http_json") as http:
            with self.assertRaisesRegex(ValueError, "mymemory_quota"):
                serve.fetch_mymemory("Hello")
        http.assert_not_called()


if __name__ == "__main__":
    unittest.main(verbosity=2)
