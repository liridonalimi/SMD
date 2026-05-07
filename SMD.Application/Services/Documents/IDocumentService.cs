using SMD.Application.Common.Results;
using SMD.Application.Contracts.Documents.Inbound;
using SMD.Application.Contracts.Documents.Outbound;
using SMD.Application.Contracts.Documents.Responses;

namespace SMD.Application.Services.Documents
{
    public interface IDocumentService
    {
        // CREATE DRAFT
        Task<ServiceResult<DraftResponse>> CreateInboundDraftAsync(CreateInboundDraftCommand cmd);
        Task<ServiceResult<DraftResponse>> CreateOutboundDraftAsync(CreateOutboundDraftCommand cmd);

        // ADD LINE (që i ke)
        Task<ServiceResult<LineResponse>> AddInboundLineAsync(Guid documentId, AddInboundLineCommand cmd);
        Task<ServiceResult<LineResponse>> AddOutboundLineAsync(Guid documentId, AddOutboundLineCommand cmd);

        // DELETE LINE
        Task<ServiceResult<DeleteLineResponse>> DeleteInboundLineAsync(DeleteInboundLineCommand cmd);
        Task<ServiceResult<DeleteLineResponse>> DeleteOutboundLineAsync(DeleteOutboundLineCommand cmd);

        // DECREMENT LINE (soft delete)
        Task<ServiceResult<DecrementLineResponse>> DecrementInboundLineAsync(DecrementInboundLineCommand cmd);
        Task<ServiceResult<DecrementLineResponse>> AdjustOutboundLineQuantityAsync(AdjustOutboundLineQuantityCommand cmd);
        Task<ServiceResult<SetOutboundPriceTierResponse>> SetOutboundPriceTierAsync(SetOutboundPriceTierCommand cmd);
        Task<ServiceResult<SetOutboundLinePriceTierResponse>> SetOutboundLinePriceTierAsync(SetOutboundLinePriceTierCommand cmd);

        // CANCEL
        Task<ServiceResult<CancelResponse>> CancelInboundAsync(CancelInboundCommand cmd);
        Task<ServiceResult<CancelResponse>> CancelOutboundAsync(CancelOutboundCommand cmd);

        // CONFIRM (që i ke)
        Task<ServiceResult<ConfirmResponse>> ConfirmInboundAsync(Guid id, Guid? userId);
        Task<ServiceResult<ConfirmResponse>> ConfirmOutboundAsync(Guid id, Guid? userId);

        // GET
        Task<ServiceResult<InboundDocumentDetailsResponse>> GetInboundByIdAsync(Guid id);
        Task<ServiceResult<OutboundDocumentDetailsResponse>> GetOutboundByIdAsync(Guid id);

        // LIST
        Task<ServiceResult<PagedResponse<DocumentListItemResponse>>> ListInboundAsync(InboundListQuery q);
        Task<ServiceResult<PagedResponse<DocumentListItemResponse>>> ListOutboundAsync(OutboundListQuery q);
        Task<ServiceResult<InboundListSummaryResponse>> GetInboundListSummaryAsync(InboundListQuery q);
        Task<ServiceResult<InboundListSummaryResponse>> GetOutboundListSummaryAsync(OutboundListQuery q);

        //Export
        //Task<ServiceResult<ExportFileResponse>> ExportInboundExcelAsync(Guid documentId);



    }
}
