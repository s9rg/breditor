/**
 * Test-only Arabic chrome catalog. It exercises a right-to-left UI language end to end; it is not a shipped
 * or reviewed translation and is deliberately kept out of the packages.
 */
import type {RichUiOptions,RichUiStrings} from "../../breditor-experimental-rich-content/src/ui_locale.js";

export const arabicStrings:RichUiStrings={
 richEditorLabel:"محرر النص المنسق",richToolbarLabel:"تنسيق النص",
 richStatusReadOnly:"للقراءة فقط · المراجعة {revision}",richStatusEditable:"قابل للتحرير · المراجعة {revision}",
 richStatusOutcome:"{outcome} · المراجعة {revision}",richStatusReadOnlyOutcome:"للقراءة فقط · {outcome} · المراجعة {revision}",
 richOperationFailed:"تعذّرت عملية المحرر",
 sharedEditorLabel:"محرر النص المشترك",sharedToolbarLabel:"أدوات النص المشترك",
 sharedStatusReadOnly:"للقراءة فقط · المراجعة المشتركة {revision}",
 sharedStatus:"المراجعة المشتركة {revision} · تراجع {undo} · {pending} بانتظار الاستلام",
 sharedStatusReadOnlyLive:"للقراءة فقط · المراجعة المشتركة {revision} · تراجع {undo} · {pending} بانتظار الاستلام",
 inputRuleRefused:"احتُفظ بالنص المكتوب؛ ورُفض اختصار ماركداون.",
 pasteLoss:"لُصق النص في {target}؛ فُقد التنسيق: {losses}.",
 controlApply:"تطبيق {label}",controlPanel:"تنسيق {label}",controlMixedHint:"قيم مختلطة: التطبيق يستبدل التنسيق بالكامل.",
 fieldChoose:"اختر…",fieldMixed:"مختلط",fieldMixedChoose:"مختلط — اختر…",
 selectionToolbarLabel:"تنسيق التحديد",contextMenuLabel:"إجراءات المحرر",
 slashLabel:"الأوامر",slashLoading:"جارٍ تحميل الأوامر…",slashCountOne:"أمر واحد متاح",slashCount:"الأوامر المتاحة: {count}",slashEmpty:"لا توجد أوامر مطابقة",
 slashUnavailable:"{label} غير متاح هنا",slashInapplicable:"{label} لم يعد منطبقًا؛ أُزيل المحفّز المكتوب فقط",
mentionLabel:"الإشارات",mentionLoading:"جارٍ تحميل الاقتراحات…",mentionCountOne:"اقتراح واحد متاح",mentionCount:"الاقتراحات المتاحة: {count}",mentionEmpty:"لا توجد اقتراحات مطابقة",
 columnResizeLabel:"تغيير عرض العمود {index} من {count}",columnResizeValue:"{width} بكسل",columnResizePreview:"{width} بكسل (معاينة)",columnResizeBadge:"{width} بكسل",
 blockDragLabel:"نقل الكتلة",
 blockDragHelp:"اسحب للنقل. أو اضغط Enter للالتقاط، والأسهم لاختيار موضع، وEnter للإفلات، وEscape للإلغاء.",
 blockDragDragging:"جارٍ سحب الكتلة.",blockDragMoved:"نُقلت الكتلة.",blockDragUnchanged:"بقيت الكتلة في مكانها.",blockDragCancelled:"أُلغي النقل.",
 blockDragNoTargets:"لا يقبل أي موضع آخر هذه الكتلة.",blockDragPickedUp:"التُقطت الكتلة. المواضع المتاحة: {count}.",blockDragPosition:"الموضع {index} من {count}.",
 blockDragReadOnly:"المستند للقراءة فقط.",blockDragUnknownBlock:"لم تعد هذه الكتلة موجودة.",blockDragNotMovable:"لا يمكن نقل هذه الكتلة.",
 blockDragInvalidTarget:"لا يمكن إفلات الكتل هنا.",blockDragCyclic:"لا يمكن نقل كتلة داخل نفسها.",
 blockDragCrossContainer:"يمكن إعادة ترتيب الكتل داخل حاويتها فقط.",blockDragGrammar:"هذه الحاوية لا تقبل هذه الكتلة.",
 blockDragEmptiesSource:"نقل الكتلة الأخيرة سيترك حاويتها فارغة.",blockDragItemLead:"يجب أن يبدأ عنصر القائمة بسطر نصي.",
 blockDragBoundary:"الكتلة عند حافة حاويتها بالفعل.",blockDragNative:"رفض المحرر النقل.",
};
export const arabicUi:RichUiOptions={
 lang:"ar",direction:"rtl",strings:arabicStrings,
 controls:{bold:{label:"عريض"},italic:{label:"مائل"},undo:{label:"تراجع"},link:{label:"رابط",fields:{href:{label:"عنوان الرابط"}}},table:{label:"إدراج جدول"}},
 slashItems:{paragraph:{label:"نص",keywords:["فقرة"]},"heading-1":{label:"عنوان 1"},"heading-2":{label:"عنوان 2"},"heading-3":{label:"عنوان 3"},"bullet-list":{label:"قائمة نقطية"},"numbered-list":{label:"قائمة مرقمة"},table:{label:"جدول"}},
};
