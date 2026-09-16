using Microsoft.AspNetCore.Identity;

namespace Factory.Domain.Identity;

public class ApplicationUser : IdentityUser
{
    public string FullName { get; set; } = string.Empty;
}
