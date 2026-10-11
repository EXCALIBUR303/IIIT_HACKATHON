"""Reference market data and news for Market Lab, behind swappable providers.

Real providers (Alpha Vantage prices, Marketaux news) are used only when their
keys are configured on the server. Keys never reach the browser. Every failure
falls back to clearly labelled demo data, and responses are cached hard because
the free tiers allow only a few calls a day.
"""
