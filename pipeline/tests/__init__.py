import os

# Belt and braces: no test may ever build live AWS clients.
os.environ["SEMA_FORBID_LIVE"] = "1"
