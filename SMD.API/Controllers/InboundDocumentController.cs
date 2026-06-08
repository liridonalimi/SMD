using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.API.Contracts.Documents.Inbound;
using SMD.Application.Common.Results;
using SMD.Application.Contracts.Documents.Inbound;
using SMD.Application.Services.Documents;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using SMD.Infrastructure.Services.Validation;
using System.Security.Claims;
using SMD.Domain.Entities;
using SMD.API.Extensions;

namespace SMD.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/inbound-documents")]
    public class InboundDocumentController : ControllerBase
    {
        private readonly SmdDbContext _db;
        private readonly IDocumentNumberService _no;
        private readonly AuditLogService _audit;
        private readonly DocumentValidationService _validator;
        private readonly IDocumentService _docs;
        public InboundDocumentController(SmdDbContext db, IDocumentNumberService no, AuditLogService audit, DocumentValidationService validator, IDocumentService docs)
        {
            _db = db;
            _no = no;
            _audit = audit;
            _validator = validator;
            _docs = docs;
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost]
        public async Task<IActionResult> CreateDraft([FromBody] CreateInboundDraftRequest req)
        {
            var cmd = new CreateInboundDraftCommand
            {
                SupplierId = req.SupplierId,
                Reference = req.Reference?.Trim(),
                Note = req.Note?.Trim()
            };

            var result = await _docs.CreateInboundDraftAsync(cmd);
            return this.ToActionResult(result);
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost("{id:guid}/lines")]
        public async Task<IActionResult> AddLine(Guid id, [FromBody] AddInboundLineRequest req)
        {
            var lotNumber = req.LotNumber?.Trim();
            var batchNumber = req.BatchNumber?.Trim();
            var expiryDate = req.ExpiryDate?.Date;

            if (string.IsNullOrWhiteSpace(lotNumber))
                return BadRequest("Seria e prodhimit eshte e detyrueshme per gjurmimin e produktit.");

            if (string.IsNullOrWhiteSpace(batchNumber))
                return BadRequest("Grupi i prodhimit eshte i detyrueshem per gjurmimin e produktit.");

            if (!expiryDate.HasValue)
                return BadRequest("Skadenca eshte e detyrueshme per gjurmimin e produktit.");

            if (expiryDate.Value < DateTime.UtcNow.Date)
                return BadRequest("Skadenca nuk mund te jete ne te kaluaren.");

            var cmd = new AddInboundLineCommand
            {
                ProductId = req.ProductId,
                ToBinId = req.ToBinId,
                LotNumber = lotNumber,
                BatchNumber = batchNumber,
                ExpiryDate = expiryDate,
                Quantity = req.Quantity
            };

            var result = await _docs.AddInboundLineAsync(id, cmd);

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500)
            };
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost("{id:guid}/lines/{lineId:guid}/decrement")]
        public async Task<IActionResult> DecrementLine(Guid id, Guid lineId, [FromBody] DecrementInboundLineRequest req)
        {
            var cmd = new DecrementInboundLineCommand
            {
                DocumentId = id,
                LineId = lineId,
                Quantity = req.Quantity
            };

            var result = await _docs.DecrementInboundLineAsync(cmd);

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500)
            };
        }

        // Endpoint për fshirje të rreshtit (Draft only)
        [Authorize(Policy = "CanEditDocuments")]
        [HttpDelete("{id:guid}/lines/{lineId:guid}")]
        public async Task<IActionResult> Delete(Guid id, Guid lineId)
        {
            var result = await _docs.DeleteInboundLineAsync(new DeleteInboundLineCommand
            {
                DocumentId = id,
                LineId = lineId
            });

            return this.ToActionResult(result);
        }

        [Authorize(Policy = "CanConfirmDocuments")]
        [HttpPost("{id:guid}/confirm")]
        public async Task<IActionResult> Confirm(Guid id)
        {
            var userId = GetUserIdOrNull();
            var result = await _docs.ConfirmInboundAsync(id, userId);
            return this.ToActionResult(result);
        }
        
        // Clean Cancel method
        [Authorize(Policy = "CanConfirmDocuments")]
        [HttpPost("{id:guid}/cancel")]
        public async Task<IActionResult> Cancel(Guid id)
        {
            var result = await _docs.CancelInboundAsync(new CancelInboundCommand
            {
                DocumentId = id
            });
            return this.ToActionResult(result);
        }
        
        // merri dokumentat sipas ID
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _docs.GetInboundByIdAsync(id);
            return this.ToActionResult(result);
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] InboundListQuery query)
        {
            var result = await _docs.ListInboundAsync(query);
            return this.ToActionResult(result);
        }

        [HttpGet("summary")]
        public async Task<IActionResult> Summary([FromQuery] InboundListQuery query)
        {
            var result = await _docs.GetInboundListSummaryAsync(query);
            return this.ToActionResult(result);
        }

        private Guid? GetUserIdOrNull()
        {
            var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(s, out var id) ? id : null;
        }
    }
}
