import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../src/LanguageContext";
import NoticeBar from "./NoticeBar";

const renderWithLanguage = (ui: React.ReactElement) => {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
};

describe("NoticeBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("renders a provided message", async () => {
    renderWithLanguage(<NoticeBar message="娴嬭瘯鍏憡鍐呭" />);

    expect(await screen.findByText("娴嬭瘯鍏憡鍐呭")).toBeInTheDocument();
  });

  it("falls back to default notice when no saved content exists and can be dismissed", async () => {
    renderWithLanguage(<NoticeBar />);

    const fallback = await screen.findByText("KNIGHTS 宸茶縼绉昏嚦 CNC Mainnet锛岃杩炴帴 CNC Mainnet 浣撻獙");
    expect(fallback).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(
      screen.queryByText("KNIGHTS 宸茶縼绉昏嚦 CNC Mainnet锛岃杩炴帴 CNC Mainnet 浣撻獙")
      ).not.toBeInTheDocument();
    });
  });
});
