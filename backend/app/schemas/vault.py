"""Vault 导入相关请求/响应模型。"""

from typing import Optional
from pydantic import BaseModel, Field


class VaultImportRequest(BaseModel):
    """Vault 导入请求体。"""

    path: str = Field(..., description="Vault 根目录绝对路径")
    source: str = Field("obsidian", description="来源标识（默认 obsidian）")


class VaultErrorEntry(BaseModel):
    """单个文件导入失败的报错信息。"""

    file: str = Field(..., description="文件名")
    reason: str = Field(..., description="失败原因")

    class Config:
        from_attributes = True


class VaultDocumentEntry(BaseModel):
    """导入成功的文档摘要。"""

    id: int = Field(..., description="文档 ID")
    doc_name: str = Field(..., description="文档名称")
    status: int = Field(..., description="文档处理状态码")

    class Config:
        from_attributes = True


class VaultImportResponse(BaseModel):
    """Vault 导入汇总响应。"""

    total_found: int = Field(0, description="扫描到的 .md 文件总数")
    imported: int = Field(0, description="成功导入数")
    failed: int = Field(0, description="失败数")
    errors: list[VaultErrorEntry] = Field(default_factory=list, description="失败详情列表")
    documents: list[VaultDocumentEntry] = Field(default_factory=list, description="成功导入的文档列表")

    class Config:
        from_attributes = True
