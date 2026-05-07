using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SMD.API.Contracts.Documents.Outbound;
using SMD.API.Extensions;
using SMD.Application.Common.Results;
using SMD.Application.Contracts.Documents.Outbound;
using SMD.Application.Services.Documents;
using SMD.Domain.Entities;
using SMD.Domain.Enums;
using SMD.Infrastructure.Persistence;
using SMD.Infrastructure.Services.Audit;
using SMD.Infrastructure.Services.Validation;
using System.Security.Claims;

namespace SMD.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/outbound-documents")]
    public class OutboundDocumentController : ControllerBase
    {
        private readonly SmdDbContext _db;
        private readonly IDocumentNumberService _no;
        private readonly AuditLogService _audit;
        private readonly DocumentValidationService _validator;
        private readonly IDocumentService _docs;
        public OutboundDocumentController(SmdDbContext db, IDocumentNumberService no, AuditLogService audit, DocumentValidationService validator, IDocumentService docs)
        {
            _db = db;
            _no = no;
            _audit = audit;
            _validator = validator;
            _docs = docs;
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost]
        public async Task<IActionResult> CreateDraft([FromBody] CreateOutboundDraftRequest req)
        {
            var cmd = new CreateOutboundDraftCommand
            {
                CustomerId = req.CustomerId,
                PriceTier = req.PriceTier,
                Reference = req.Reference?.Trim(),
                Note = req.Note?.Trim()
            };

            var result = await _docs.CreateOutboundDraftAsync(cmd);
            return this.ToActionResult(result);
        }
       
        [Authorize(Policy = "CanEditDocuments")]
        [HttpPut("{id:guid}/price-tier")]
        public async Task<IActionResult> SetPriceTier(Guid id, [FromBody] SetOutboundPriceTierRequest req)
        {
            var result = await _docs.SetOutboundPriceTierAsync(new SetOutboundPriceTierCommand
            {
                DocumentId = id,
                PriceTier = req.PriceTier
            });

            return this.ToActionResult(result);
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPut("{id:guid}/lines/{lineId:guid}/price-tier")]
        public async Task<IActionResult> SetLinePriceTier(Guid id, Guid lineId, [FromBody] SetOutboundLinePriceTierRequest req)
        {
            var result = await _docs.SetOutboundLinePriceTierAsync(new SetOutboundLinePriceTierCommand
            {
                DocumentId = id,
                LineId = lineId,
                PriceTier = req.PriceTier
            });

            return this.ToActionResult(result);
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost("{id:guid}/lines")]
        public async Task<IActionResult> AddLine(Guid id, [FromBody] AddOutboundLineRequest req)
        {
            var cmd = new AddOutboundLineCommand
            {
                ProductId = req.ProductId,
                FromBinId = req.FromBinId,
                LotNumber = req.LotNumber,
                BatchNumber = req.BatchNumber,
                ExpiryDate = req.ExpiryDate,
                Quantity = req.Quantity
            };

            var result = await _docs.AddOutboundLineAsync(id, cmd);

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500, "Gabim i paparashikueshem.")
            };
        }

        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost("{id:guid}/lines/{lineId:guid}/adjust")]
        public async Task<IActionResult> AdjustLine(Guid id, Guid lineId, [FromBody] AdjustOutboundLineQuantityRequest req)
        {
            var result = await _docs.AdjustOutboundLineQuantityAsync(new AdjustOutboundLineQuantityCommand
            {
                DocumentId = id,
                LineId = lineId,
                Delta = req.Delta
            });

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500, "Gabim i paparashikueshem.")
            };
        }

        // Endpoint për fshirje të rreshtit (Draft only)
        [Authorize(Policy = "CanEditDocuments")]
        [HttpDelete("{id:guid}/lines/{lineId:guid}")]
        public async Task<IActionResult> Delete(Guid id, Guid lineId)
        {
            var result = await _docs.DeleteOutboundLineAsync(new DeleteOutboundLineCommand
            {
                DocumentId = id,
                LineId = lineId
            });

            return this.ToActionResult(result);
        }
        
        // clean Confirm method-service 
        [Authorize(Policy = "CanConfirmDocuments")]
        [HttpPost("{id:guid}/confirm")]
        public async Task<IActionResult> Confirm(Guid id)
        {
            var userId = GetUserIdOrNull();

            var result = await _docs.ConfirmOutboundAsync(id, userId);

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500, "Unexpected error. Gabim i papritur.")
            };
        }
        
        // cancel clean method
        [Authorize(Policy = "CanEditDocuments")]
        [HttpPost("{id:guid}/cancel")]
        public async Task<IActionResult> Cancel(Guid id)
        {
            var result = await _docs.CancelOutboundAsync(new CancelOutboundCommand
            {
                DocumentId = id
            });

            return result.Type switch
            {
                ServiceResultType.Ok => Ok(result.Data),
                ServiceResultType.NotFound => NotFound(result.Error),
                ServiceResultType.BadRequest => BadRequest(result.Error),
                ServiceResultType.Conflict => Conflict(result.Error),
                _ => StatusCode(500)
            };
        }
        
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetById(Guid id)
        {
            var result = await _docs.GetOutboundByIdAsync(id);
            return this.ToActionResult(result);
        }

        [HttpGet]
        public async Task<IActionResult> List([FromQuery] OutboundListQuery query)
        {
            var result = await _docs.ListOutboundAsync(query);
            return this.ToActionResult(result);
        }

        [HttpGet("summary")]
        public async Task<IActionResult> Summary([FromQuery] OutboundListQuery query)
        {
            var result = await _docs.GetOutboundListSummaryAsync(query);
            return this.ToActionResult(result);
        }

        private Guid? GetUserIdOrNull()
        {
            var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return Guid.TryParse(s, out var id) ? id : null;
        }
    }
}
