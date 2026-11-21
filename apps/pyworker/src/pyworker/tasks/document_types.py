"""Shared coordinates refer to pixels of the upright full-size page."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Pixel = Annotated[int, Field(ge=0, le=12000)]
Label = Literal[
    "", "IMIĘ", "NAZWISKO", "OSOBA", "PESEL", "NIP", "KONTO", "EMAIL", "TELEFON", "ADRES", "DANE"
]


class Word(BaseModel):
    text: str = Field(max_length=500)
    box: tuple[Pixel, Pixel, Pixel, Pixel]
    confidence: float | None = Field(default=None, ge=0, le=100)
    label: Label = ""


class Page(BaseModel):
    width: int = Field(ge=1, le=12000)
    height: int = Field(ge=1, le=12000)
    words: list[Word] = Field(max_length=5000)

    @model_validator(mode="after")
    def check_boxes(self):
        for word in self.words:
            x, y, right, bottom = word.box
            if not (x < right <= self.width and y < bottom <= self.height):
                raise ValueError("Invalid page region")
        return self


class DocumentTask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ticket: UUID | None = None
    page_index: int | None = Field(default=None, ge=0, lt=12)
    operation: Literal["ocr", "detect", "export"]
    pages: list[Page] = Field(default_factory=list, max_length=12)
    variant: Literal["original", "black", "labels"] = "original"
