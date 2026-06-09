"""文档预处理服务模块。

将原始文档 → 干净结构化文本作为独立管道阶段，
每种文件类型有专门的预处理规则。

管道：
  Parser → PreprocessorRouter → Chunker → Quality Filter → Embedder

MD 使用 Section 树解析 + 弹性映射，PDF/TXT/DOCX 使用逐页清洗 + 公共归拢。
"""
from app.services.preprocessor.base import BasePreprocessor
from app.services.preprocessor.docx import DocxPreprocessor
from app.services.preprocessor.markdown import MarkdownPreprocessor
from app.services.preprocessor.pdf import PDFPreprocessor
from app.services.preprocessor.txt import TxtPreprocessor


class PreprocessorRouter:
    """按文件类型路由到对应预处理器。

    用法：
        router = PreprocessorRouter()
        clean_pages = await router.preprocess("md", pages)
    """

    def __init__(self):
        self._processors: dict[str, BasePreprocessor] = {
            "md": MarkdownPreprocessor(),
            "pdf": PDFPreprocessor(),
            "txt": TxtPreprocessor(),
            "docx": DocxPreprocessor(),
            "doc": DocxPreprocessor(),
        }

    async def preprocess(
        self,
        doc_type: str,
        pages: list[tuple[str, int | None]],
    ) -> list[tuple[str, int | None]]:
        """按文件类型分发预处理。

        Args:
            doc_type: 文件类型（md / pdf / txt / docx / doc）
            pages: Parser 输出 [(text, page_number), ...]

        Returns:
            预处理后的 [(text, page_number), ...]
            MD: Section 列表（page_number 均为 None）
            PDF/TXT: 清洗归拢后的页面（保持原始 page_number）
        """
        processor = self._processors.get(doc_type.lower())
        if processor is None:
            # 未知类型，原样返回
            return pages
        return await processor.process(pages)


# 模块级单例
_preprocessor_router: PreprocessorRouter | None = None


def get_preprocessor() -> PreprocessorRouter:
    """获取预处理器路由单例。"""
    global _preprocessor_router
    if _preprocessor_router is None:
        _preprocessor_router = PreprocessorRouter()
    return _preprocessor_router
