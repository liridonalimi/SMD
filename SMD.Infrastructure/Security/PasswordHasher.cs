using System;
using System.Collections.Generic;
using System.Text;
using BCrypt.Net;

namespace SMD.Infrastructure.Security
{
    public static class PasswordHasher
    {
        public static string Hash(string password)
        {
            return BCrypt.Net.BCrypt.HashPassword(password);
        }

        public static bool Verify(string password, string hash)
        {
            if (string.IsNullOrWhiteSpace(hash))
            {
                return false;
            }

            try
            {
                return BCrypt.Net.BCrypt.Verify(password, hash);
            }
            catch (SaltParseException)
            {
                return false;
            }
            catch (HashInformationException)
            {
                return false;
            }
        }
    }
}
