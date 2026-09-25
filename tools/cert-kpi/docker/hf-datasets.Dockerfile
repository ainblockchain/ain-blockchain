FROM ain-cert-ainize:repro-20260911-r2
RUN /opt/runtime/bin/pip install --no-cache-dir datasets==5.0.1 huggingface-hub==1.30.0 && /opt/runtime/bin/pip freeze > /opt/runtime/hf-requirements.resolved.txt
ENTRYPOINT ["/opt/runtime/bin/python"]
