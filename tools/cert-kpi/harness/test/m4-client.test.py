from gevent import monkey
monkey.patch_all()

import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

os.environ["M4_RUN"] = "unit_m4_client"
spec = importlib.util.spec_from_file_location("m4_client", Path(__file__).resolve().parents[1] / "locustfile.py")
client = importlib.util.module_from_spec(spec)
spec.loader.exec_module(client)


class ClientTests(unittest.TestCase):
    def setUp(self):
        client._rec_buf = []
        client._rec_enqueued = 0
        client._rec_sent = 0
        client._rec_fail = 0

    def infer(self, payload, status=200):
        response = Mock(status_code=status)
        response.json.return_value = payload
        context = Mock()
        context.__enter__ = Mock(return_value=response)
        context.__exit__ = Mock(return_value=False)
        user = SimpleNamespace(client=Mock())
        user.client.post.return_value = context
        client.InferenceUser.infer(user)
        return response

    def test_valid_inference_records_tokens(self):
        response = self.infer({"usage": {"completion_tokens": 1}, "choices": [{"text": "4"}]})
        response.failure.assert_not_called()
        self.assertEqual(client._rec_buf[0]["tokensGenerated"], 1)
        self.assertEqual(client._rec_enqueued, 1)

    def test_invalid_inference_is_not_recorded(self):
        for payload in [{}, {"usage": {"completion_tokens": 0}, "choices": [{"text": "4"}]},
                        {"usage": {"completion_tokens": 2}, "choices": [{"text": " "}]}]:
            with self.subTest(payload=payload):
                self.infer(payload).failure.assert_called_once()
                self.assertEqual(client._rec_enqueued, 0)

    def test_http_error_is_not_recorded(self):
        self.infer({}, 500).failure.assert_called_once()
        self.assertEqual(client._rec_enqueued, 0)

    def test_recorder_http_error_is_not_counted_as_sent(self):
        response = Mock()
        response.raise_for_status.side_effect = RuntimeError("HTTP 500")
        with patch.object(client.requests, "post", return_value=response):
            client._post_batch([{"requestId": "test"}], 2)
        self.assertEqual(client._rec_sent, 0)
        self.assertEqual(client._rec_fail, 1)

    def test_recorder_acknowledgement(self):
        for acknowledgement, expected in [({"queued": 1}, 1), ({"queued": 0}, 1), ({}, 0), ({"queued": 2}, 0)]:
            with self.subTest(acknowledgement=acknowledgement):
                client._rec_sent = 0
                response = Mock()
                response.json.return_value = acknowledgement
                with patch.object(client.requests, "post", return_value=response):
                    client._post_batch([{"requestId": "test"}], 2)
                self.assertEqual(client._rec_sent, expected)


if __name__ == "__main__":
    unittest.main()
