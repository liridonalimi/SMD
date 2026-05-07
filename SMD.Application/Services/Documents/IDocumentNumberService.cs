namespace SMD.Application.Services.Documents
{
    public interface IDocumentNumberService
    {
        Task<string> NextInboundNo();
        Task<string> NextOutboundNo();
    }
}
